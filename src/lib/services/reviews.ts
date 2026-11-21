import { AppError } from '@/lib/errors';
import 'server-only';
import { invalidateCatalog } from '@/lib/cache';
import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import type { DB } from '@/lib/db/client';
import { notify } from '@/lib/notifications';
import { audit } from '@/lib/security';

const { reviews, reviewImages, reviewResponses, reviewVotes, orderItems, sellerOrders, orders, products, stores } = schema;
type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];

export class ReviewError extends AppError {}

/**
 * Artículos que la persona puede reseñar para un producto: los compró, el sub-pedido fue ENTREGADO
 * y aún no lo reseñó. Esto es lo que convierte una reseña en "compra verificada".
 */
export async function reviewableItems(userId: string, productId: string) {
  const already = await db.select({ id: reviews.id }).from(reviews).where(and(eq(reviews.userId, userId), eq(reviews.productId, productId))).limit(1);
  if (already.length) return [];
  return db.select({ orderItemId: orderItems.id, variantName: orderItems.variantName, deliveredOrder: orders.number })
    .from(orderItems)
    .innerJoin(sellerOrders, eq(sellerOrders.id, orderItems.sellerOrderId))
    .innerJoin(orders, eq(orders.id, sellerOrders.orderId))
    .where(and(eq(orders.buyerId, userId), eq(orderItems.productId, productId), eq(sellerOrders.status, 'delivered')))
    .limit(1);
}

/** Recalcula promedios desde la fuente (no suma/resta incremental: así nunca se desajustan). */
export async function recomputeRatings(tx: Tx | DB, productId: string, storeId: string) {
  await tx.update(products).set({
    ratingAvg: sql`coalesce((select round(avg(rating)::numeric, 2) from reviews where product_id = ${productId} and status = 'published'), 0)`,
    ratingCount: sql`(select count(*)::int from reviews where product_id = ${productId} and status = 'published')`,
  }).where(eq(products.id, productId));
  await tx.update(stores).set({
    ratingAvg: sql`coalesce((select round(avg(rating)::numeric, 2) from reviews where store_id = ${storeId} and status = 'published'), 0)`,
    ratingCount: sql`(select count(*)::int from reviews where store_id = ${storeId} and status = 'published')`,
  }).where(eq(stores.id, storeId));
}

export async function createReview(userId: string, input: { orderItemId: string; rating: number; title?: string; body: string; images: { url: string; thumbUrl: string }[] }) {
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) throw new ReviewError('Elige de 1 a 5 estrellas');
  const body = input.body.trim();
  if (body.length < 10 || body.length > 3000) throw new ReviewError('La reseña debe tener entre 10 y 3000 caracteres');

  const review = await db.transaction(async (tx) => {
    const [item] = await tx.select({ productId: orderItems.productId, storeId: sellerOrders.storeId, buyerId: orders.buyerId, status: sellerOrders.status })
      .from(orderItems).innerJoin(sellerOrders, eq(sellerOrders.id, orderItems.sellerOrderId)).innerJoin(orders, eq(orders.id, sellerOrders.orderId))
      .where(eq(orderItems.id, input.orderItemId));
    // Solo quien compró, con el pedido entregado, puede reseñar.
    if (!item || item.buyerId !== userId || !item.productId) throw new ReviewError('No encontramos una compra elegible para reseñar');
    if (item.status !== 'delivered') throw new ReviewError('Podrás reseñar cuando recibas tu pedido');
    const [r] = await tx.insert(reviews).values({
      productId: item.productId, storeId: item.storeId, userId, orderItemId: input.orderItemId,
      rating: input.rating, title: input.title?.trim().slice(0, 120) || null, body, verified: true,
    }).onConflictDoNothing().returning();
    if (!r) throw new ReviewError('Ya reseñaste este producto');
    if (input.images.length) await tx.insert(reviewImages).values(input.images.map((im, i) => ({ reviewId: r.id, url: im.url, thumbUrl: im.thumbUrl, position: i })));
    await recomputeRatings(tx, item.productId, item.storeId);
    return r;
  });

  invalidateCatalog();
  const [info] = await db.select({ ownerId: stores.ownerId, title: products.title, slug: products.slug })
    .from(products).innerJoin(stores, eq(stores.id, products.storeId)).where(eq(products.id, review.productId));
  await notify(info.ownerId, { type: 'new_review', title: `Nueva reseña de ${review.rating}★`, body: `En "${info.title}".`, link: '/vendedor/resenas' }, { email: true });
  return { review, productSlug: info.slug };
}

/** "¿Te resultó útil?" — un voto por persona; no se puede votar la reseña propia. */
export async function toggleHelpful(userId: string, reviewId: string) {
  return db.transaction(async (tx) => {
    const [r] = await tx.select({ userId: reviews.userId }).from(reviews).where(eq(reviews.id, reviewId));
    if (!r) throw new ReviewError('Reseña no encontrada');
    if (r.userId === userId) throw new ReviewError('No puedes votar tu propia reseña');
    const removed = await tx.delete(reviewVotes).where(and(eq(reviewVotes.reviewId, reviewId), eq(reviewVotes.userId, userId))).returning();
    if (!removed.length) await tx.insert(reviewVotes).values({ reviewId, userId });
    await tx.update(reviews).set({ helpfulCount: sql`(select count(*)::int from review_votes where review_id = ${reviewId})` }).where(eq(reviews.id, reviewId));
    return !removed.length;
  }).finally(invalidateCatalog);
}

/** Respuesta pública del vendedor (una por reseña, editable). Verifica que la reseña sea de su tienda. */
export async function respondToReview(store: { id: string }, authorId: string, reviewId: string, bodyRaw: string) {
  const body = bodyRaw.trim();
  if (body.length < 2 || body.length > 2000) throw new ReviewError('La respuesta debe tener entre 2 y 2000 caracteres');
  const [r] = await db.select({ storeId: reviews.storeId, userId: reviews.userId, productId: reviews.productId }).from(reviews).where(eq(reviews.id, reviewId));
  if (!r || r.storeId !== store.id) throw new ReviewError('Reseña no encontrada');
  await db.insert(reviewResponses).values({ reviewId, storeId: store.id, authorId, body })
    .onConflictDoUpdate({ target: reviewResponses.reviewId, set: { body, updatedAt: new Date() } });
  const [prod] = await db.select({ slug: products.slug }).from(products).where(eq(products.id, r.productId));
  await notify(r.userId, { type: 'review_response', title: 'La tienda respondió tu reseña', link: `/producto/${prod.slug}#resenas` });
  invalidateCatalog();
  await audit(authorId, 'review.responded', 'review', reviewId);
}

/** Moderación (administrador): ocultar o volver a publicar. Recalcula promedios. */
export async function setReviewStatus(adminId: string, reviewId: string, status: 'published' | 'hidden') {
  await db.transaction(async (tx) => {
    const [r] = await tx.update(reviews).set({ status }).where(eq(reviews.id, reviewId)).returning();
    if (!r) throw new ReviewError('Reseña no encontrada');
    await recomputeRatings(tx, r.productId, r.storeId);
  });
  invalidateCatalog();
  await audit(adminId, `review.${status}`, 'review', reviewId);
}
