'use server';

import { invalidateCatalog } from '@/lib/cache';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { AppError, runAction, str, type ActionState } from '@/lib/errors';
import { assertSeller, assertUser } from '@/lib/auth/guards';
import { db, schema } from '@/lib/db';
import { audit, rateLimit } from '@/lib/security';
import { saveImage } from '@/lib/storage';
import { parseMoney } from '@/lib/utils';
import { needsEmailCheck } from '@/lib/config';
import { createStore } from '@/lib/services/community';
import { markDelivered, markProcessing, markShipped } from '@/lib/services/orders';
import { respondToReview } from '@/lib/services/reviews';
import { answerQuestion, setQuestionVisibility } from '@/lib/services/questions';
import { saveProduct, setProductStatus, setVariantStock } from '@/lib/services/seller/products';
import type { ProductStatus } from '@/lib/services/seller/queries';
import { CARRIERS } from '@/components/seller/constants';

const uuid = z.uuid();
const id = (v: string) => {
  if (!uuid.safeParse(v).success) throw new AppError('Elemento no encontrado');
  return v;
};
const seller = async () => {
  const { user, store } = await assertSeller();
  return { user, store, s: { userId: user.id, storeId: store.id } };
};

// ---------- Alta de tienda ----------
export async function createStoreAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const res = await runAction(async () => {
    const user = await assertUser();
    if (needsEmailCheck(user)) throw new AppError('Confirma tu correo antes de abrir tu tienda');
    if (!(await rateLimit('create-store', 5, 3600, user.id))) throw new AppError('Demasiados intentos. Intenta más tarde.');
    await createStore(user, {
      name: str(fd, 'name', 60), description: str(fd, 'description', 1000), city: str(fd, 'city', 80), state: str(fd, 'state', 60),
      legalName: str(fd, 'legalName', 150), phone: str(fd, 'phone', 20), acceptTerms: fd.get('terms') === 'on',
    });
  });
  if (res?.error) return res;
  redirect('/vendedor?bienvenida=1');
}

// ---------- Productos ----------
export async function saveProductAction(productId: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  let to = '';
  const res = await runAction(async () => {
    const { s } = await seller();
    if (!(await rateLimit('product-save', 60, 600, s.userId))) throw new AppError('Vas muy rápido. Espera un momento.');
    const r = await saveProduct(s, productId ? id(productId) : null, fd);
    invalidateCatalog();
    revalidatePath('/vendedor', 'layout');
    invalidateCatalog();
    revalidatePath(`/producto/${r.slug}`);
    to = `/vendedor/productos/${r.id}?guardado=${r.status}`;
  });
  if (res?.error) return res;
  // Redirige siempre: el formulario se vuelve a montar con los ids nuevos de imágenes y variantes.
  redirect(to);
}

export async function setProductStatusAction(productId: string, to: ProductStatus, _: ActionState): Promise<ActionState> {
  return runAction(async () => {
    const { s } = await seller();
    const slug = await setProductStatus(s, id(productId), to);
    invalidateCatalog();
    revalidatePath('/vendedor', 'layout');
    invalidateCatalog();
    revalidatePath(`/producto/${slug}`);
    return { active: 'Producto publicado', paused: 'Producto pausado', archived: 'Producto archivado', draft: 'Producto movido a borradores' }[to as string] ?? 'Listo';
  });
}

export async function updateStockAction(variantId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { s } = await seller();
    const raw = str(fd, 'stock', 10);
    const delta = await setVariantStock(s, id(variantId), raw === '' ? NaN : Number(raw));
    invalidateCatalog();
    revalidatePath('/vendedor', 'layout');
    return delta ? 'Existencias actualizadas' : 'Sin cambios';
  });
}

// ---------- Pedidos ----------
export async function markProcessingAction(sellerOrderId: string, _: ActionState): Promise<ActionState> {
  return runAction(async () => {
    const { user, store } = await seller();
    await markProcessing(id(sellerOrderId), store.id, user.id);
    invalidateCatalog();
    revalidatePath('/vendedor', 'layout');
    return 'Pedido marcado en preparación';
  });
}

export async function markShippedAction(sellerOrderId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user, store } = await seller();
    const choice = str(fd, 'carrier', 60);
    if (!(CARRIERS as readonly string[]).includes(choice)) throw new AppError('Elige la paquetería');
    const carrier = choice === 'Otra' ? str(fd, 'carrierOther', 60) : choice;
    if (!carrier) throw new AppError('Escribe el nombre de la paquetería');
    const trackingNumber = str(fd, 'trackingNumber', 80);
    if (!/^[A-Za-z0-9-]{4,80}$/.test(trackingNumber)) throw new AppError('Escribe un número de guía válido (letras, números o guiones)');
    await markShipped(id(sellerOrderId), store.id, user.id, { carrier, trackingNumber });
    invalidateCatalog();
    revalidatePath('/vendedor', 'layout');
    return 'Pedido marcado como enviado. Avisamos al comprador.';
  });
}

export async function markDeliveredAction(sellerOrderId: string, _: ActionState): Promise<ActionState> {
  return runAction(async () => {
    const { user, store } = await seller();
    await markDelivered(id(sellerOrderId), { id: user.id, storeId: store.id });
    invalidateCatalog();
    revalidatePath('/vendedor', 'layout');
    return 'Entrega confirmada';
  });
}

// ---------- Reseñas ----------
export async function respondReviewAction(reviewId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user, store } = await seller();
    if (!(await rateLimit('review-response', 60, 3600, user.id))) throw new AppError('Demasiadas respuestas seguidas. Intenta más tarde.');
    await respondToReview(store, user.id, id(reviewId), str(fd, 'body', 2000));
    invalidateCatalog();
    revalidatePath('/vendedor/resenas');
    return 'Respuesta publicada';
  });
}

// ---------- Cupones ----------
const dateInput = z.union([z.literal(''), z.iso.date('Fecha inválida')]);
/** Fechas del formulario en hora del centro de México (UTC−6, sin horario de verano desde 2022). */
const mxDate = (d: string, end: boolean) => (d ? new Date(`${d}T${end ? '23:59:59' : '00:00:00'}-06:00`) : null);

export async function createCouponAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user, store } = await seller();
    const code = str(fd, 'code', 30).toUpperCase();
    if (!/^[A-Z0-9]{3,20}$/.test(code)) throw new AppError('El código debe tener de 3 a 20 letras (A–Z) o números, sin espacios');
    const type = str(fd, 'type') === 'fixed' ? 'fixed' : 'percent';
    const value = type === 'percent' ? Number(str(fd, 'value', 10)) : parseMoney(str(fd, 'value', 20));
    if (type === 'percent' && !(Number.isInteger(value) && value >= 1 && value <= 90)) throw new AppError('El porcentaje debe ser un entero de 1 a 90');
    if (type === 'fixed' && !(Number.isFinite(value) && value > 0 && value <= 100_000_000)) throw new AppError('Escribe un monto de descuento válido');
    const minRaw = str(fd, 'minSubtotal', 20);
    const minSubtotal = minRaw ? parseMoney(minRaw) : 0;
    if (!Number.isFinite(minSubtotal) || minSubtotal > 100_000_000) throw new AppError('Compra mínima inválida');
    const maxRaw = str(fd, 'maxUses', 10);
    const maxUses = maxRaw ? Number(maxRaw) : null;
    if (maxUses !== null && !(Number.isInteger(maxUses) && maxUses >= 1 && maxUses <= 1_000_000)) throw new AppError('Usos máximos inválidos');
    const starts = dateInput.safeParse(str(fd, 'startsAt', 10)), ends = dateInput.safeParse(str(fd, 'endsAt', 10));
    if (!starts.success || !ends.success) throw new AppError('Fecha inválida');
    const startsAt = mxDate(starts.data, false), endsAt = mxDate(ends.data, true);
    if (startsAt && endsAt && endsAt < startsAt) throw new AppError('La fecha de fin debe ser posterior al inicio');

    const [dup] = await db.select({ id: schema.coupons.id }).from(schema.coupons)
      .where(and(eq(schema.coupons.storeId, store.id), sql`upper(${schema.coupons.code}) = ${code}`)).limit(1);
    if (dup) throw new AppError(`Ya tienes un cupón con el código ${code}`);
    const [c] = await db.insert(schema.coupons).values({
      storeId: store.id, code, type, value, minSubtotal, maxUses, startsAt, endsAt, active: fd.get('active') === 'on',
    }).onConflictDoNothing().returning({ id: schema.coupons.id });
    if (!c) throw new AppError(`Ya tienes un cupón con el código ${code}`);
    await audit(user.id, 'coupon.created', 'coupon', c.id, { code, type, value });
    invalidateCatalog();
    revalidatePath('/vendedor/cupones');
    return `Cupón ${code} creado`;
  });
}

export async function toggleCouponAction(couponId: string, _: ActionState): Promise<ActionState> {
  return runAction(async () => {
    const { user, store } = await seller();
    const [c] = await db.update(schema.coupons).set({ active: sql`not ${schema.coupons.active}` })
      .where(and(eq(schema.coupons.id, id(couponId)), eq(schema.coupons.storeId, store.id))).returning({ active: schema.coupons.active });
    if (!c) throw new AppError('Cupón no encontrado');
    await audit(user.id, c.active ? 'coupon.activated' : 'coupon.deactivated', 'coupon', couponId);
    invalidateCatalog();
    revalidatePath('/vendedor/cupones');
    return c.active ? 'Cupón activado' : 'Cupón desactivado';
  });
}

export async function deleteCouponAction(couponId: string, _: ActionState): Promise<ActionState> {
  return runAction(async () => {
    const { user, store } = await seller();
    // seller_orders.coupon_id es ON DELETE SET NULL y guarda coupon_code: el historial se conserva.
    const [c] = await db.delete(schema.coupons).where(and(eq(schema.coupons.id, id(couponId)), eq(schema.coupons.storeId, store.id)))
      .returning({ code: schema.coupons.code });
    if (!c) throw new AppError('Cupón no encontrado');
    await audit(user.id, 'coupon.deleted', 'coupon', couponId, { code: c.code });
    invalidateCatalog();
    revalidatePath('/vendedor/cupones');
    return 'Cupón eliminado';
  });
}

// ---------- Tienda y configuración ----------
export async function updateStoreAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user, store } = await seller();
    const name = str(fd, 'name', 80);
    if (name.length < 3 || name.length > 60) throw new AppError('El nombre debe tener entre 3 y 60 caracteres');
    const file = (k: string) => { const f = fd.get(k); return f instanceof File && f.size > 0 ? f : null; };
    const logo = file('logo'), banner = file('banner');
    if ((logo || banner) && !(await rateLimit('store-images', 20, 3600, user.id))) throw new AppError('Demasiadas imágenes subidas. Intenta más tarde.');
    const logoUrl = logo ? (await saveImage(logo, 'stores')).thumbUrl : undefined;
    const bannerUrl = banner ? (await saveImage(banner, 'stores')).url : undefined;
    const [s] = await db.update(schema.stores).set({
      name, description: str(fd, 'description', 1000), city: str(fd, 'city', 80) || null, state: str(fd, 'state', 60) || null,
      ...(logoUrl && { logoUrl }), ...(bannerUrl && { bannerUrl }),
    }).where(eq(schema.stores.id, store.id)).returning({ slug: schema.stores.slug });
    await audit(user.id, 'store.updated', 'store', store.id, { logo: !!logoUrl, banner: !!bannerUrl });
    invalidateCatalog();
    revalidatePath('/vendedor', 'layout');
    invalidateCatalog();
    revalidatePath(`/tienda/${s.slug}`);
    return 'Tienda actualizada';
  });
}

export async function updateShippingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user, store } = await seller();
    const flat = parseMoney(str(fd, 'shippingFlat', 20) || '0');
    if (!Number.isFinite(flat) || flat > 1_000_000) throw new AppError('Costo de envío inválido (máximo $10,000)');
    const freeRaw = str(fd, 'freeShippingOver', 20);
    const free = freeRaw ? parseMoney(freeRaw) : null;
    if (free !== null && (!Number.isFinite(free) || free > 100_000_000)) throw new AppError('Monto para envío gratis inválido');
    const days = Number(str(fd, 'processingDays', 3));
    if (!Number.isInteger(days) || days < 1 || days > 15) throw new AppError('Los días de preparación deben ser de 1 a 15');
    await db.update(schema.stores).set({ shippingFlat: flat, freeShippingOver: free, processingDays: days }).where(eq(schema.stores.id, store.id));
    await audit(user.id, 'store.shipping_updated', 'store', store.id, { flat, free, days });
    invalidateCatalog();
    revalidatePath('/vendedor/configuracion');
    return 'Configuración de envíos guardada';
  });
}

export async function updateSellerProfileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user } = await seller();
    const legalName = str(fd, 'legalName', 150);
    if (legalName.length < 3) throw new AppError('Escribe tu nombre o razón social');
    const phone = str(fd, 'phone', 20);
    if (!/^\+?\d{10,15}$/.test(phone.replace(/[\s-]/g, ''))) throw new AppError('Teléfono inválido (10 dígitos)');
    const taxId = str(fd, 'taxId', 13).toUpperCase() || null;
    // RFC: 3 letras (moral) o 4 (física) + fecha AAMMDD + homoclave de 3.
    if (taxId && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(taxId)) throw new AppError('RFC inválido. Ejemplo: GODE561231GR8');
    await db.insert(schema.sellerProfiles).values({ userId: user.id, legalName, phone, taxId, acceptedTermsAt: new Date() })
      .onConflictDoUpdate({ target: schema.sellerProfiles.userId, set: { legalName, phone, taxId } });
    await audit(user.id, 'seller_profile.updated', 'seller_profile', user.id, { taxId: !!taxId });
    invalidateCatalog();
    revalidatePath('/vendedor/configuracion');
    return 'Datos fiscales y de contacto guardados';
  });
}

// ---------- Preguntas ----------
export async function answerQuestionAction(questionId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user, store } = await seller();
    if (!(await rateLimit('question-answer', 120, 3600, user.id))) throw new AppError('Demasiadas respuestas seguidas. Intenta más tarde.');
    await answerQuestion(store, user.id, id(questionId), str(fd, 'answer', 1100));
    invalidateCatalog();
    revalidatePath('/vendedor/preguntas');
    return 'Respuesta publicada';
  });
}

export async function questionVisibilityAction(questionId: string, status: 'published' | 'hidden', _: ActionState): Promise<ActionState> {
  return runAction(async () => {
    const { user, store } = await seller();
    await setQuestionVisibility(store, user.id, id(questionId), status);
    invalidateCatalog();
    revalidatePath('/vendedor/preguntas');
    return status === 'hidden' ? 'Pregunta ocultada' : 'Pregunta visible de nuevo';
  });
}
