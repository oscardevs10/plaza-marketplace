import { AppError } from '@/lib/errors';
import 'server-only';
import { invalidateCatalog } from '@/lib/cache';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { slugify } from '@/lib/utils';
import { notify } from '@/lib/notifications';
import { audit } from '@/lib/security';

const { favorites, storeFollowers, stores, sellerProfiles, userRoles, roles, reports, notifications, products } = schema;

export class CommunityError extends AppError {}

export async function toggleFavorite(userId: string, productId: string) {
  const removed = await db.delete(favorites).where(and(eq(favorites.userId, userId), eq(favorites.productId, productId))).returning();
  if (removed.length) return false;
  const [prod] = await db.select({ id: products.id }).from(products).where(and(eq(products.id, productId), eq(products.status, 'active')));
  if (!prod) throw new CommunityError('Producto no disponible');
  await db.insert(favorites).values({ userId, productId }).onConflictDoNothing();
  return true;
}

export async function isFavorite(userId: string, productId: string) {
  return (await db.select().from(favorites).where(and(eq(favorites.userId, userId), eq(favorites.productId, productId))).limit(1)).length > 0;
}

export async function favoriteIds(userId: string) {
  return (await db.select({ id: favorites.productId }).from(favorites).where(eq(favorites.userId, userId))).map((f) => f.id);
}

export async function toggleFollow(userId: string, storeId: string) {
  const [store] = await db.select({ ownerId: stores.ownerId, name: stores.name }).from(stores).where(and(eq(stores.id, storeId), eq(stores.status, 'active')));
  if (!store) throw new CommunityError('Tienda no disponible');
  if (store.ownerId === userId) throw new CommunityError('No puedes seguir tu propia tienda');
  const removed = await db.delete(storeFollowers).where(and(eq(storeFollowers.userId, userId), eq(storeFollowers.storeId, storeId))).returning();
  if (removed.length) { invalidateCatalog(); return false; }
  await db.insert(storeFollowers).values({ userId, storeId }).onConflictDoNothing();
  invalidateCatalog();
  await notify(store.ownerId, { type: 'new_follower', title: 'Tienes un nuevo seguidor', body: `Alguien empezó a seguir ${store.name}.`, link: '/vendedor' });
  return true;
}

export async function isFollowing(userId: string, storeId: string) {
  return (await db.select().from(storeFollowers).where(and(eq(storeFollowers.userId, userId), eq(storeFollowers.storeId, storeId))).limit(1)).length > 0;
}

const REPORT_REASONS = ['fraude', 'producto_prohibido', 'informacion_falsa', 'contenido_ofensivo', 'spam', 'otro'] as const;
export const REPORT_REASON_LABELS: Record<(typeof REPORT_REASONS)[number], string> = {
  fraude: 'Posible fraude o estafa', producto_prohibido: 'Producto prohibido', informacion_falsa: 'Información falsa o engañosa',
  contenido_ofensivo: 'Contenido ofensivo', spam: 'Spam', otro: 'Otro motivo',
};

export async function createReport(reporterId: string, input: { targetType: 'product' | 'review' | 'store' | 'user'; targetId: string; reason: string; details?: string }) {
  if (!(REPORT_REASONS as readonly string[]).includes(input.reason)) throw new CommunityError('Elige un motivo');
  const r = await db.insert(reports).values({
    reporterId, targetType: input.targetType, targetId: input.targetId, reason: input.reason, details: input.details?.trim().slice(0, 1000) || null,
  }).onConflictDoNothing().returning({ id: reports.id });
  if (!r.length) throw new CommunityError('Ya enviaste un reporte sobre esto. Nuestro equipo lo revisará.');
}

// ---------- Tiendas ----------
export async function createStore(user: { id: string }, input: { name: string; description: string; city: string; state: string; legalName: string; phone: string; acceptTerms: boolean }) {
  const name = input.name.trim();
  if (name.length < 3 || name.length > 60) throw new CommunityError('El nombre debe tener entre 3 y 60 caracteres');
  if (!input.acceptTerms) throw new CommunityError('Debes aceptar los términos para vendedores');
  if (!/^\+?\d{10,15}$/.test(input.phone.replace(/[\s-]/g, ''))) throw new CommunityError('Teléfono inválido');
  if (input.legalName.trim().length < 3) throw new CommunityError('Escribe tu nombre o razón social');
  let slug = slugify(name);
  if (slug.length < 3) throw new CommunityError('Usa un nombre con letras o números');
  const taken = await db.select({ id: stores.id }).from(stores).where(eq(stores.slug, slug));
  if (taken.length) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

  const store = await db.transaction(async (tx) => {
    const existing = await tx.select({ id: stores.id }).from(stores).where(eq(stores.ownerId, user.id));
    if (existing.length) throw new CommunityError('Ya tienes una tienda');
    await tx.insert(sellerProfiles).values({ userId: user.id, legalName: input.legalName.trim(), phone: input.phone.trim(), acceptedTermsAt: new Date() })
      .onConflictDoUpdate({ target: sellerProfiles.userId, set: { legalName: input.legalName.trim(), phone: input.phone.trim() } });
    const [s] = await tx.insert(stores).values({
      ownerId: user.id, slug, name, description: input.description.trim().slice(0, 1000), city: input.city.trim() || null, state: input.state.trim() || null,
    }).returning();
    const [seller] = await tx.select({ id: roles.id }).from(roles).where(eq(roles.key, 'seller'));
    await tx.insert(userRoles).values({ userId: user.id, roleId: seller.id }).onConflictDoNothing();
    return s;
  });
  await audit(user.id, 'store.created', 'store', store.id, { slug: store.slug });
  return store;
}

// ---------- Notificaciones ----------
export async function listNotifications(userId: string, limit = 30) {
  return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(limit);
}
export async function unreadCount(userId: string) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(notifications).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return r.n;
}
export async function markAllRead(userId: string) {
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}
