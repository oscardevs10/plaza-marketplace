import { AppError } from '@/lib/errors';
import 'server-only';
import { invalidateCatalog } from '@/lib/cache';
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import type { DB } from '@/lib/db/client';
import { APP_URL } from '@/lib/config';
import { formatMoney, orderNumber } from '@/lib/utils';
import { notify } from '@/lib/notifications';
import { audit } from '@/lib/security';
import { getProvider } from '@/lib/payments/providers';
import type { ProviderId } from '@/lib/payments/types';
import { loadCart } from './cart';
import { commission } from './pricing';
import type { AddressSnapshot } from '@/lib/db/schema';

const { orders, sellerOrders, orderItems, productVariants: v, products: p, coupons, inventoryMovements, cartItems, payments,
  paymentTransactions, platformCommissions, shipments, shipmentEvents, stores } = schema;
type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];

export class OrderError extends AppError {}
const PAYMENT_WINDOW_MIN = 60;

async function commissionRates(tx: Tx) {
  const rules = await tx.select().from(platformCommissions);
  const global = rules.find((r) => r.categoryId == null)?.rateBps ?? 1000;
  const byCat = new Map(rules.filter((r) => r.categoryId != null).map((r) => [r.categoryId!, r.rateBps]));
  const parents = new Map((await tx.select({ id: schema.categories.id, parentId: schema.categories.parentId }).from(schema.categories)).map((c) => [c.id, c.parentId]));
  // Subcategoría → su regla, si no la de su categoría padre, si no la global.
  return (categoryId: number) => byCat.get(categoryId) ?? byCat.get(parents.get(categoryId) ?? -1) ?? global;
}

/**
 * Convierte el carrito en un pedido principal + un sub-pedido por tienda, todo en una transacción:
 * revalida precios y existencias en el servidor, aparta inventario, aplica cupones y calcula comisiones.
 */
export async function placeOrder(buyer: { id: string; name: string; email: string }, input: {
  address: AddressSnapshot; coupons: Record<string, string>; provider: ProviderId;
}) {
  const provider = getProvider(input.provider);
  if (!provider?.isConfigured()) throw new OrderError('Método de pago no disponible');
  await expireStaleOrders();

  const [cart] = await db.select({ id: schema.carts.id }).from(schema.carts).where(eq(schema.carts.userId, buyer.id));
  if (!cart) throw new OrderError('Tu carrito está vacío');

  const order = await db.transaction(async (tx) => {
    // Bloquea las variantes del carrito: dos compradores no pueden llevarse la última pieza a la vez.
    const variantIds = (await tx.select({ id: cartItems.variantId }).from(cartItems).where(eq(cartItems.cartId, cart.id))).map((r) => r.id);
    if (!variantIds.length) throw new OrderError('Tu carrito está vacío');
    await tx.select({ id: v.id }).from(v).where(inArray(v.id, variantIds)).for('update');

    const view = await loadCart(input.coupons, { cartId: cart.id, tx });
    if (view.hasProblems) throw new OrderError('Algunos productos cambiaron de disponibilidad. Revisa tu carrito.');
    if (view.groups.some((g) => g.store.ownerId === buyer.id)) throw new OrderError('No puedes comprar productos de tu propia tienda');
    const badCoupon = view.groups.find((g) => g.coupon?.problem);
    if (badCoupon) throw new OrderError(`${badCoupon.store.name}: ${badCoupon.coupon!.problem}`);

    const rateFor = await commissionRates(tx);
    const [o] = await tx.insert(orders).values({
      buyerId: buyer.id, buyerName: buyer.name, buyerEmail: buyer.email, shippingAddress: input.address,
      subtotal: view.totals.subtotal, discountTotal: view.totals.discount, shippingTotal: view.totals.shipping, total: view.totals.total,
      expiresAt: new Date(Date.now() + PAYMENT_WINDOW_MIN * 60_000),
    }).returning();

    for (const g of view.groups) {
      let couponId: string | null = null;
      if (g.coupon && g.discount > 0) {
        const [c] = await tx.update(coupons).set({ uses: sql`${coupons.uses} + 1` })
          .where(and(eq(coupons.storeId, g.store.id), sql`upper(${coupons.code}) = ${g.coupon.code}`, sql`(${coupons.maxUses} is null or ${coupons.uses} < ${coupons.maxUses})`))
          .returning({ id: coupons.id });
        if (!c) throw new OrderError(`${g.store.name}: el cupón ya se agotó`);
        couponId = c.id;
      }
      const fee = commission(g.lines, g.discount, rateFor);
      const [so] = await tx.insert(sellerOrders).values({
        orderId: o.id, storeId: g.store.id, subtotal: g.subtotal, discount: g.discount, shipping: g.shipping, total: g.total,
        couponId, couponCode: couponId ? g.coupon!.code : null,
        commissionRateBps: fee.rateBps, commissionAmount: fee.amount, sellerNet: g.total - fee.amount,
      }).returning({ id: sellerOrders.id });
      for (const l of g.lines) {
        const dec = await tx.update(v).set({ stock: sql`${v.stock} - ${l.quantity}` })
          .where(and(eq(v.id, l.variantId), sql`${v.stock} >= ${l.quantity}`)).returning({ id: v.id });
        if (!dec.length) throw new OrderError(`Ya no hay suficientes piezas de ${l.title}`);
        await tx.insert(inventoryMovements).values({ variantId: l.variantId, delta: -l.quantity, reason: 'order', refId: o.id, actorId: buyer.id });
        await tx.insert(orderItems).values({
          sellerOrderId: so.id, productId: l.productId, variantId: l.variantId, title: l.title, variantName: l.variantName,
          imageUrl: l.image, unitPrice: l.unitPrice, quantity: l.quantity, lineTotal: l.unitPrice * l.quantity,
        });
      }
    }
    await tx.delete(cartItems).where(eq(cartItems.cartId, cart.id));
    return o;
  });

  invalidateCatalog(); // existencias cambiaron
  await audit(buyer.id, 'order.placed', 'order', order.id, { total: order.total, provider: provider.id });
  // Aviso a la tienda cuando una compra agota una opción.
  const emptied = await db.selectDistinct({ title: orderItems.title, variant: orderItems.variantName, ownerId: stores.ownerId })
    .from(orderItems).innerJoin(sellerOrders, eq(sellerOrders.id, orderItems.sellerOrderId)).innerJoin(stores, eq(stores.id, sellerOrders.storeId))
    .innerJoin(v, eq(v.id, orderItems.variantId)).where(and(eq(sellerOrders.orderId, order.id), eq(v.stock, 0)));
  for (const e of emptied) {
    await notify(e.ownerId, { type: 'out_of_stock', title: `Se agotó: ${e.title}`, body: e.variant !== 'Único' ? `Opción ${e.variant}.` : undefined, link: '/vendedor/inventario' }, { email: true });
  }
  const checkoutUrl = await startPayment(order.id, provider.id);
  return { order, checkoutUrl };
}

/** Crea (o reutiliza) el intento de pago del pedido y devuelve la URL del proveedor. */
export async function startPayment(orderId: string, providerId: ProviderId) {
  const provider = getProvider(providerId);
  if (!provider?.isConfigured()) throw new OrderError('Método de pago no disponible');
  const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!o || o.status !== 'pending_payment') throw new OrderError('Este pedido ya no admite pagos');
  const [existing] = await db.select().from(payments)
    .where(and(eq(payments.orderId, orderId), eq(payments.provider, providerId), inArray(payments.status, ['created', 'pending'])));
  if (existing?.checkoutUrl) return existing.checkoutUrl;
  const [pay] = existing ? [existing] : await db.insert(payments).values({ orderId, provider: providerId, amount: o.total, currency: o.currency }).returning();
  const { checkoutUrl, providerPaymentId } = await provider.createCheckout({
    paymentId: pay.id, orderNumber: o.number, amount: o.total, currency: o.currency, buyerEmail: o.buyerEmail,
    returnUrl: `${APP_URL}/cuenta/pedidos/${o.id}?pago=retorno`, cancelUrl: `${APP_URL}/cuenta/pedidos/${o.id}?pago=cancelado`,
    webhookUrl: `${APP_URL}/api/webhooks/${providerId}`,
  });
  await db.update(payments).set({ checkoutUrl, providerPaymentId: providerPaymentId ?? null, status: 'pending' }).where(eq(payments.id, pay.id));
  await db.insert(paymentTransactions).values({ paymentId: pay.id, provider: providerId, type: 'checkout_created', status: 'pending', amount: o.total });
  return checkoutUrl;
}

/** Devuelve el inventario de un pedido no pagado y lo cancela. */
async function releaseOrder(tx: Tx, orderId: string, reason: string) {
  const [o] = await tx.update(orders).set({ status: 'cancelled' })
    .where(and(eq(orders.id, orderId), eq(orders.status, 'pending_payment'))).returning({ id: orders.id });
  if (!o) return false;
  const items = await tx.select({ variantId: orderItems.variantId, quantity: orderItems.quantity, couponId: sellerOrders.couponId })
    .from(orderItems).innerJoin(sellerOrders, eq(sellerOrders.id, orderItems.sellerOrderId)).where(eq(sellerOrders.orderId, orderId));
  for (const it of items) {
    if (!it.variantId) continue;
    await tx.update(v).set({ stock: sql`${v.stock} + ${it.quantity}` }).where(eq(v.id, it.variantId));
    await tx.insert(inventoryMovements).values({ variantId: it.variantId, delta: it.quantity, reason: `order_cancel:${reason}`, refId: orderId });
  }
  for (const cid of new Set(items.map((i) => i.couponId).filter(Boolean))) {
    await tx.update(coupons).set({ uses: sql`greatest(${coupons.uses} - 1, 0)` }).where(eq(coupons.id, cid!));
  }
  await tx.update(sellerOrders).set({ status: 'cancelled' }).where(eq(sellerOrders.orderId, orderId));
  await tx.update(payments).set({ status: 'cancelled' }).where(and(eq(payments.orderId, orderId), inArray(payments.status, ['created', 'pending'])));
  return true;
}

/**
 * Cancela pedidos cuya ventana de pago venció. Se llama al iniciar un checkout y desde /api/cron/expirar-pedidos
 * (programar cada 10-15 min en producción).
 */
export async function expireStaleOrders() {
  const stale = await db.select({ id: orders.id }).from(orders)
    .where(and(eq(orders.status, 'pending_payment'), lt(orders.expiresAt, sql`now()`))).limit(50);
  for (const o of stale) await db.transaction((tx) => releaseOrder(tx, o.id, 'expired'));
  if (stale.length) invalidateCatalog();
  return stale.length;
}

export async function cancelPendingOrder(orderId: string, buyerId: string) {
  const ok = await db.transaction(async (tx) => {
    const [o] = await tx.select({ buyerId: orders.buyerId }).from(orders).where(eq(orders.id, orderId));
    if (!o || o.buyerId !== buyerId) throw new OrderError('Pedido no encontrado');
    return releaseOrder(tx, orderId, 'buyer');
  });
  if (!ok) throw new OrderError('Solo se pueden cancelar pedidos pendientes de pago');
  invalidateCatalog();
  await audit(buyerId, 'order.cancelled', 'order', orderId);
}

/**
 * Aplica un estado de pago YA VERIFICADO con el proveedor. Idempotente: el mismo evento no se procesa dos veces
 * y un pago aprobado no vuelve a marcar el pedido.
 */
export async function applyVerifiedPayment(providerId: ProviderId, eventId: string, verified: { paymentId: string; providerPaymentId: string; state: string; amount: number; currency: string; amountRefunded?: number }) {
  const [pay] = await db.select().from(payments).where(eq(payments.id, verified.paymentId));
  if (!pay || pay.provider !== providerId) return { ok: false, reason: 'payment-not-found' };

  const inserted = await db.insert(paymentTransactions).values({
    paymentId: pay.id, provider: providerId, type: 'webhook', providerEventId: eventId, status: verified.state as 'pending', amount: verified.amount,
    data: { state: verified.state, amount: verified.amount, currency: verified.currency, refunded: verified.amountRefunded ?? 0 },
  }).onConflictDoNothing().returning({ id: paymentTransactions.id });
  if (!inserted.length) return { ok: true, reason: 'duplicate-event' };

  const effects = await db.transaction(async (tx) => {
    const [cur] = await tx.select().from(payments).where(eq(payments.id, pay.id)).for('update');
    const [o] = await tx.select().from(orders).where(eq(orders.id, cur.orderId)).for('update');
    await tx.update(payments).set({ providerPaymentId: verified.providerPaymentId }).where(eq(payments.id, cur.id));

    if (verified.state === 'approved' && (cur.status === 'created' || cur.status === 'pending')) {
      if (verified.amount !== cur.amount || verified.currency !== cur.currency) return { kind: 'mismatch' as const, order: o };
      await tx.update(payments).set({ status: 'approved' }).where(eq(payments.id, cur.id));
      if (o.status !== 'pending_payment') return { kind: 'paid-but-closed' as const, order: o }; // p. ej. expiró antes de pagar
      await tx.update(orders).set({ status: 'paid', paidAt: new Date(), expiresAt: null }).where(eq(orders.id, o.id));
      await tx.update(sellerOrders).set({ status: 'paid' }).where(eq(sellerOrders.orderId, o.id));
      const sold = await tx.select({ productId: orderItems.productId, quantity: orderItems.quantity, storeId: sellerOrders.storeId })
        .from(orderItems).innerJoin(sellerOrders, eq(sellerOrders.id, orderItems.sellerOrderId)).where(eq(sellerOrders.orderId, o.id));
      for (const s of sold) {
        if (s.productId) await tx.update(p).set({ salesCount: sql`${p.salesCount} + ${s.quantity}` }).where(eq(p.id, s.productId));
      }
      for (const storeId of new Set(sold.map((s) => s.storeId))) {
        await tx.update(stores).set({ salesCount: sql`${stores.salesCount} + 1` }).where(eq(stores.id, storeId));
      }
      return { kind: 'paid' as const, order: o };
    }
    if ((verified.state === 'rejected' || verified.state === 'cancelled') && (cur.status === 'created' || cur.status === 'pending')) {
      await tx.update(payments).set({ status: verified.state }).where(eq(payments.id, cur.id));
      return { kind: 'failed' as const, order: o };
    }
    if ((verified.state === 'refunded' || verified.state === 'partially_refunded') && cur.status !== verified.state) {
      await tx.update(payments).set({ status: verified.state, amountRefunded: verified.amountRefunded ?? cur.amount }).where(eq(payments.id, cur.id));
      if (verified.state === 'refunded') {
        await tx.update(orders).set({ status: 'refunded' }).where(eq(orders.id, o.id));
        await tx.update(sellerOrders).set({ status: 'refunded' }).where(eq(sellerOrders.orderId, o.id));
      }
      return { kind: 'refunded' as const, order: o };
    }
    return { kind: 'noop' as const, order: o };
  });

  if (effects.kind !== 'noop') invalidateCatalog(); // ventas y existencias
  const o = effects.order;
  const num = orderNumber(o.number);
  if (effects.kind === 'paid') {
    await notify(o.buyerId, { type: 'payment_confirmed', title: `Pago confirmado · ${num}`, body: `Recibimos tu pago de ${formatMoney(o.total)}. Las tiendas ya están preparando tu pedido.`, link: `/cuenta/pedidos/${o.id}` }, { email: true });
    const sos = await db.select({ id: sellerOrders.id, total: sellerOrders.total, ownerId: stores.ownerId })
      .from(sellerOrders).innerJoin(stores, eq(stores.id, sellerOrders.storeId)).where(eq(sellerOrders.orderId, o.id));
    for (const so of sos) {
      await notify(so.ownerId, { type: 'new_order', title: `Nuevo pedido pagado · ${num}`, body: `Tienes un pedido por ${formatMoney(so.total)} listo para preparar.`, link: `/vendedor/pedidos/${so.id}` }, { email: true });
    }
  } else if (effects.kind === 'paid-but-closed' || effects.kind === 'mismatch') {
    await audit(null, `payment.${effects.kind}`, 'payment', pay.id, { expected: pay.amount, got: verified.amount, currency: verified.currency });
    const admins = await db.select({ id: schema.userRoles.userId }).from(schema.userRoles).innerJoin(schema.roles, eq(schema.roles.id, schema.userRoles.roleId)).where(eq(schema.roles.key, 'admin'));
    for (const a of admins) await notify(a.id, { type: 'moderation', title: `Revisar pago del pedido ${num}`, body: effects.kind === 'mismatch' ? 'El monto pagado no coincide con el pedido.' : 'Se recibió un pago para un pedido que ya estaba cerrado: requiere reembolso.', link: '/admin/pagos' });
  } else if (effects.kind === 'failed') {
    await notify(o.buyerId, { type: 'order_status', title: `Pago no completado · ${num}`, body: 'Tu pago fue rechazado o cancelado. Puedes intentar de nuevo desde tu pedido.', link: `/cuenta/pedidos/${o.id}` });
  }
  return { ok: true, reason: effects.kind };
}

/** Webhook o retorno del proveedor: verifica con el proveedor y aplica. */
export async function processProviderEvent(providerId: ProviderId, eventId: string, ref: string) {
  const provider = getProvider(providerId)!;
  const verified = await provider.fetchPayment(ref);
  if (!verified) return { ok: false, reason: 'not-found' };
  return applyVerifiedPayment(providerId, eventId, verified);
}

// ---------- Cumplimiento (vendedor) ----------

/** Carga un sub-pedido verificando que pertenece a la tienda (un vendedor jamás ve pedidos ajenos). */
export async function getSellerOrderForStore(sellerOrderId: string, storeId: string) {
  return db.query.sellerOrders.findFirst({
    where: and(eq(sellerOrders.id, sellerOrderId), eq(sellerOrders.storeId, storeId)),
    with: { order: true, items: true, shipment: { with: { events: { orderBy: (e, { asc }) => [asc(e.occurredAt)] } } } },
  });
}

export async function markProcessing(sellerOrderId: string, storeId: string, actorId: string) {
  const r = await db.update(sellerOrders).set({ status: 'processing' })
    .where(and(eq(sellerOrders.id, sellerOrderId), eq(sellerOrders.storeId, storeId), eq(sellerOrders.status, 'paid'))).returning({ id: sellerOrders.id });
  if (!r.length) throw new OrderError('El pedido no está en estado "pagado"');
  await audit(actorId, 'seller_order.processing', 'seller_order', sellerOrderId);
}

export async function markShipped(sellerOrderId: string, storeId: string, actorId: string, data: { carrier: string; trackingNumber: string }) {
  const carrier = data.carrier.trim().slice(0, 60), tracking = data.trackingNumber.trim().slice(0, 80);
  if (!carrier || !tracking) throw new OrderError('Indica la paquetería y el número de guía');
  const so = await db.transaction(async (tx) => {
    const [so] = await tx.update(sellerOrders).set({ status: 'shipped' })
      .where(and(eq(sellerOrders.id, sellerOrderId), eq(sellerOrders.storeId, storeId), inArray(sellerOrders.status, ['paid', 'processing'])))
      .returning();
    if (!so) throw new OrderError('Solo puedes enviar pedidos pagados');
    const [sh] = await tx.insert(shipments).values({ sellerOrderId, carrier, trackingNumber: tracking, status: 'in_transit', shippedAt: new Date() })
      .onConflictDoUpdate({ target: shipments.sellerOrderId, set: { carrier, trackingNumber: tracking, status: 'in_transit', shippedAt: new Date() } })
      .returning({ id: shipments.id });
    await tx.insert(shipmentEvents).values({ shipmentId: sh.id, status: 'in_transit', description: `Enviado con ${carrier} · guía ${tracking}`, createdBy: actorId });
    return so;
  });
  const [o] = await db.select().from(orders).where(eq(orders.id, so.orderId));
  await notify(o.buyerId, { type: 'order_shipped', title: `Tu pedido va en camino · ${orderNumber(o.number)}`, body: `Paquetería: ${carrier}. Guía: ${tracking}.`, link: `/cuenta/pedidos/${o.id}` }, { email: true });
  await audit(actorId, 'seller_order.shipped', 'seller_order', sellerOrderId, { carrier });
}

/** Lo confirma el comprador o el vendedor. Al entregarse se habilitan las reseñas verificadas. */
export async function markDelivered(sellerOrderId: string, actor: { id: string; storeId?: string; buyer?: boolean }) {
  const res = await db.transaction(async (tx) => {
    const [so] = await tx.select({ so: sellerOrders, buyerId: orders.buyerId }).from(sellerOrders).innerJoin(orders, eq(orders.id, sellerOrders.orderId))
      .where(eq(sellerOrders.id, sellerOrderId)).for('update');
    if (!so) throw new OrderError('Pedido no encontrado');
    const allowed = actor.buyer ? so.buyerId === actor.id : so.so.storeId === actor.storeId;
    if (!allowed) throw new OrderError('Pedido no encontrado');
    if (so.so.status !== 'shipped') throw new OrderError('Solo se pueden entregar pedidos enviados');
    await tx.update(sellerOrders).set({ status: 'delivered', payoutStatus: 'eligible' }).where(eq(sellerOrders.id, sellerOrderId));
    const [sh] = await tx.update(shipments).set({ status: 'delivered', deliveredAt: new Date() }).where(eq(shipments.sellerOrderId, sellerOrderId)).returning({ id: shipments.id });
    if (sh) await tx.insert(shipmentEvents).values({ shipmentId: sh.id, status: 'delivered', description: actor.buyer ? 'Entrega confirmada por el comprador' : 'Entrega confirmada por la tienda', createdBy: actor.id });
    const pending = await tx.select({ id: sellerOrders.id }).from(sellerOrders)
      .where(and(eq(sellerOrders.orderId, so.so.orderId), inArray(sellerOrders.status, ['paid', 'processing', 'shipped'])));
    if (!pending.length) await tx.update(orders).set({ status: 'completed' }).where(eq(orders.id, so.so.orderId));
    return { orderId: so.so.orderId, buyerId: so.buyerId };
  });
  const [o] = await db.select({ number: orders.number }).from(orders).where(eq(orders.id, res.orderId));
  await notify(res.buyerId, { type: 'order_delivered', title: `Pedido entregado · ${orderNumber(o.number)}`, body: '¿Qué te pareció? Ya puedes calificar tus productos.', link: `/cuenta/pedidos/${res.orderId}` });
  await audit(actor.id, 'seller_order.delivered', 'seller_order', sellerOrderId);
}

/** Reembolso total de un pedido pagado (administrador). El inventario no se repone automáticamente: el producto puede no haber regresado. */
export async function refundOrder(orderId: string, adminId: string) {
  const [pay] = await db.select().from(payments).where(and(eq(payments.orderId, orderId), eq(payments.status, 'approved')));
  if (!pay?.providerPaymentId) throw new OrderError('Este pedido no tiene un pago aprobado para reembolsar');
  const provider = getProvider(pay.provider)!;
  const { refundId } = await provider.refund(pay.providerPaymentId, pay.amount - pay.amountRefunded);
  await audit(adminId, 'payment.refund_requested', 'payment', pay.id, { refundId, amount: pay.amount - pay.amountRefunded });
  // El estado definitivo llega por webhook; en sandbox lo confirmamos de inmediato.
  if (pay.provider === 'sandbox') {
    await db.insert(paymentTransactions).values({ paymentId: pay.id, provider: 'sandbox', type: 'sandbox_event', data: { state: 'refunded' } });
    await processProviderEvent('sandbox', `refund:${refundId}`, pay.providerPaymentId);
  }
  const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
  await notify(o.buyerId, { type: 'order_status', title: `Reembolso en proceso · ${orderNumber(o.number)}`, body: `Solicitamos el reembolso de ${formatMoney(pay.amount - pay.amountRefunded)} a tu método de pago.`, link: `/cuenta/pedidos/${o.id}` }, { email: true });
  return refundId;
}
