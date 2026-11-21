'use server';

import { redirect } from 'next/navigation';
import { refresh, revalidatePath } from 'next/cache';
import { z } from 'zod';
import { AppError, runAction, str, type ActionState } from '@/lib/errors';
import { assertUser } from '@/lib/auth/guards';
import { getCurrentUser } from '@/lib/auth/session';
import { addToCart, setCartQuantity } from '@/lib/services/cart';
import { placeOrder, startPayment, cancelPendingOrder, markDelivered, processProviderEvent } from '@/lib/services/orders';
import { toggleFavorite, toggleFollow, createReport } from '@/lib/services/community';
import { createReview, toggleHelpful } from '@/lib/services/reviews';
import { askQuestion } from '@/lib/services/questions';
import { filesFrom, saveImage } from '@/lib/storage';
import { LIMITS, needsEmailCheck } from '@/lib/config';
import { rateLimit } from '@/lib/security';
import { db, schema } from '@/lib/db';
import { and, eq } from 'drizzle-orm';
import { PROVIDERS } from '@/lib/payments/providers';
import type { ProviderId } from '@/lib/payments/types';

const uuid = z.uuid();

export async function addToCartAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const variantId = uuid.safeParse(fd.get('variantId'));
    if (!variantId.success) throw new AppError('Elige una opción');
    if (!(await rateLimit('cart', 60, 60))) throw new AppError('Vas muy rápido. Espera un momento.');
    await addToCart(variantId.data, Number(fd.get('quantity') ?? 1));
    refresh(); // actualiza el contador del carrito en el encabezado
    return 'Agregado al carrito';
  });
}

export async function buyNowAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const res = await addToCartAction(null, fd);
  if (res?.error) return res;
  redirect('/carrito');
}

export async function updateCartAction(fd: FormData) {
  const variantId = uuid.safeParse(fd.get('variantId'));
  if (!variantId.success) return;
  await setCartQuantity(variantId.data, Number(fd.get('quantity')));
  revalidatePath('/carrito');
}

const addressSchema = z.object({
  recipientName: z.string().trim().min(3, 'Escribe el nombre de quien recibe').max(100),
  phone: z.string().trim().regex(/^\+?[\d\s-]{10,16}$/, 'Teléfono inválido (10 dígitos)'),
  street: z.string().trim().min(2, 'Escribe la calle').max(120),
  extNumber: z.string().trim().min(1, 'Número exterior').max(20),
  intNumber: z.string().trim().max(20).optional(),
  neighborhood: z.string().trim().min(2, 'Escribe la colonia').max(100),
  city: z.string().trim().min(2, 'Escribe la ciudad o municipio').max(80),
  state: z.string().trim().min(2, 'Elige el estado').max(60),
  postalCode: z.string().trim().regex(/^\d{5}$/, 'El código postal tiene 5 dígitos'),
  references: z.string().trim().max(300).optional(),
});

export async function checkoutAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let url = '';
  const res = await runAction(async () => {
    const user = await assertUser();
    if (needsEmailCheck(user)) throw new AppError('Confirma tu correo antes de comprar (revisa tu bandeja o reenvía el enlace desde tu cuenta).');
    if (!(await rateLimit('checkout', 10, 600, user.id))) throw new AppError('Demasiados intentos de compra. Espera unos minutos.');
    const parsed = addressSchema.safeParse(Object.fromEntries(['recipientName', 'phone', 'street', 'extNumber', 'intNumber', 'neighborhood', 'city', 'state', 'postalCode', 'references'].map((k) => [k, str(fd, k)])));
    if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
    const provider = str(fd, 'provider') as ProviderId;
    if (!Object.hasOwn(PROVIDERS, provider)) throw new AppError('Elige un método de pago');
    const coupons: Record<string, string> = {};
    for (const [k, v] of fd.entries()) if (k.startsWith('coupon:') && typeof v === 'string' && v.trim()) coupons[k.slice(7)] = v.trim().slice(0, 30);
    const address = { ...parsed.data, intNumber: parsed.data.intNumber || null, references: parsed.data.references || null, country: 'MX' };
    if (fd.get('saveAddress') === 'on') {
      const existing = await db.select({ id: schema.addresses.id }).from(schema.addresses).where(eq(schema.addresses.userId, user.id)).limit(1);
      await db.insert(schema.addresses).values({ userId: user.id, ...address, isDefault: existing.length === 0 });
    }
    const { checkoutUrl } = await placeOrder(user, { address, coupons, provider });
    url = checkoutUrl;
  });
  if (res?.error) return res;
  revalidatePath('/', 'layout'); // el contador del carrito del encabezado ya está en cero
  redirect(url);
}

export async function retryPaymentAction(orderId: string, fd: FormData) {
  const user = await assertUser();
  const [o] = await db.select({ buyerId: schema.orders.buyerId }).from(schema.orders).where(eq(schema.orders.id, orderId));
  if (!o || o.buyerId !== user.id) throw new AppError('Pedido no encontrado');
  const provider = String(fd.get('provider') ?? 'sandbox') as ProviderId;
  redirect(await startPayment(orderId, Object.hasOwn(PROVIDERS, provider) ? provider : 'sandbox'));
}

export async function cancelOrderAction(orderId: string, _: ActionState): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertUser();
    await cancelPendingOrder(orderId, user.id);
    revalidatePath(`/cuenta/pedidos/${orderId}`);
    return 'Pedido cancelado';
  });
}

export async function confirmDeliveryAction(sellerOrderId: string, _: ActionState): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertUser();
    await markDelivered(sellerOrderId, { id: user.id, buyer: true });
    revalidatePath('/cuenta/pedidos', 'layout');
    return '¡Gracias! Ya puedes calificar tus productos.';
  });
}

/** Página del sandbox: simula la decisión del proveedor con un evento firmado y lo procesa por el mismo camino que un webhook real. */
export async function sandboxDecisionAction(paymentId: string, fd: FormData) {
  const user = await assertUser();
  const decision = fd.get('decision') === 'approve' ? 'approved' : 'rejected';
  const [pay] = await db.select({ id: schema.payments.id, ref: schema.payments.providerPaymentId, orderId: schema.payments.orderId, buyerId: schema.orders.buyerId, provider: schema.payments.provider })
    .from(schema.payments).innerJoin(schema.orders, eq(schema.orders.id, schema.payments.orderId)).where(eq(schema.payments.id, paymentId));
  if (!pay || pay.buyerId !== user.id || pay.provider !== 'sandbox' || !PROVIDERS.sandbox.isConfigured()) throw new AppError('Pago no encontrado');
  await db.insert(schema.paymentTransactions).values({ paymentId: pay.id, provider: 'sandbox', type: 'sandbox_event', data: { state: decision } });
  await processProviderEvent('sandbox', `sbx_evt_${crypto.randomUUID()}`, pay.ref!);
  revalidatePath('/', 'layout');
  redirect(`/cuenta/pedidos/${pay.orderId}?pago=${decision === 'approved' ? 'aprobado' : 'rechazado'}`);
}

export async function toggleFavoriteAction(productId: string, _: ActionState): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) redirect(`/entrar?next=${encodeURIComponent('/cuenta/favoritos')}`);
  return runAction(async () => {
    const added = await toggleFavorite(user.id, productId);
    refresh();
    return added ? 'Guardado en favoritos' : 'Quitado de favoritos';
  });
}

export async function toggleFollowAction(storeId: string, slug: string, _: ActionState): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) redirect(`/entrar?next=${encodeURIComponent(`/tienda/${slug}`)}`);
  return runAction(async () => {
    const following = await toggleFollow(user.id, storeId);
    revalidatePath(`/tienda/${slug}`);
    return following ? `Ahora sigues a esta tienda` : 'Dejaste de seguir la tienda';
  });
}

export async function reportAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertUser();
    if (!(await rateLimit('report', 10, 3600, user.id))) throw new AppError('Has enviado muchos reportes. Intenta más tarde.');
    const type = str(fd, 'targetType') as 'product' | 'review' | 'store';
    if (!['product', 'review', 'store'].includes(type)) throw new AppError('Reporte inválido');
    const id = uuid.safeParse(fd.get('targetId'));
    if (!id.success) throw new AppError('Reporte inválido');
    await createReport(user.id, { targetType: type, targetId: id.data, reason: str(fd, 'reason', 40), details: str(fd, 'details', 1000) });
    return 'Gracias. Nuestro equipo revisará tu reporte.';
  });
}

export async function helpfulAction(reviewId: string, _: ActionState): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) redirect('/entrar');
  return runAction(async () => {
    const voted = await toggleHelpful(user.id, reviewId);
    refresh();
    return voted ? 'Gracias por tu voto' : 'Voto retirado';
  });
}

export async function createReviewAction(orderItemId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  let slug = '';
  const res = await runAction(async () => {
    const user = await assertUser();
    if (!(await rateLimit('review', 10, 3600, user.id))) throw new AppError('Has publicado muchas reseñas en poco tiempo. Intenta más tarde.');
    // Verifica propiedad antes de procesar imágenes (no gastamos CPU en solicitudes ajenas).
    const owned = await db.select({ id: schema.orderItems.id }).from(schema.orderItems)
      .innerJoin(schema.sellerOrders, eq(schema.sellerOrders.id, schema.orderItems.sellerOrderId))
      .innerJoin(schema.orders, and(eq(schema.orders.id, schema.sellerOrders.orderId), eq(schema.orders.buyerId, user.id)))
      .where(eq(schema.orderItems.id, orderItemId));
    if (!owned.length) throw new AppError('Compra no encontrada');
    const files = filesFrom(fd, 'images', LIMITS.reviewImages);
    const images = [];
    for (const f of files) images.push(await saveImage(f, 'reviews'));
    const r = await createReview(user.id, { orderItemId, rating: Number(fd.get('rating')), title: str(fd, 'title', 120), body: str(fd, 'body', 3000), images });
    slug = r.productSlug;
  });
  if (res?.error) return res;
  redirect(`/producto/${slug}?resena=publicada#resenas`);
}

export async function askQuestionAction(productId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) redirect('/entrar');
  return runAction(async () => {
    if (!uuid.safeParse(productId).success) throw new AppError('Producto no encontrado');
    if (!(await rateLimit('question', 10, 3600, user.id))) throw new AppError('Has hecho muchas preguntas seguidas. Intenta más tarde.');
    await askQuestion(user, productId, str(fd, 'body', 600));
    revalidatePath('/producto/[slug]', 'page');
    return 'Pregunta enviada. Te avisaremos cuando la tienda responda.';
  });
}
