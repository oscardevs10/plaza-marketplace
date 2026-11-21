'use server';

import { invalidateCatalog } from '@/lib/cache';
import { revalidatePath } from 'next/cache';
import { and, count, eq, isNotNull, isNull } from 'drizzle-orm';
import { AppError, int, runAction, str, type ActionState } from '@/lib/errors';
import { assertAdmin } from '@/lib/auth/guards';
import { destroyAllSessions } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { audit } from '@/lib/security';
import { notify } from '@/lib/notifications';
import { expireStaleOrders, refundOrder } from '@/lib/services/orders';
import { setReviewStatus } from '@/lib/services/reviews';
import { isUuid } from '@/lib/services/admin';
import { percentToBps } from '@/lib/services/admin/format';
import { orderNumber, slugify } from '@/lib/utils';

const { users, userRoles, roles, stores, products, orders, categories, platformCommissions, reports, platformSettings } = schema;

// Los cambios de moderación afectan el sitio público: se invalida todo el árbol.
const done = (msg: string) => {
  invalidateCatalog();
  revalidatePath('/', 'layout');
  return msg;
};
const id = (v: string) => {
  if (!isUuid(v)) throw new AppError('Identificador inválido');
  return v;
};
const confirmed = (fd: FormData) => {
  if (fd.get('confirm') !== 'on') throw new AppError('Marca la casilla para confirmar');
};
const reasonOf = (fd: FormData) => {
  const r = str(fd, 'reason', 500);
  if (r.length < 3) throw new AppError('Escribe el motivo (mínimo 3 caracteres)');
  return r;
};

// ---------- Resumen ----------
export async function expireOrdersAction(): Promise<ActionState> {
  return runAction(async () => {
    const admin = await assertAdmin();
    const n = await expireStaleOrders();
    await audit(admin.id, 'order.expire_stale', 'order', null, { expired: n });
    return done(n ? `Se cancelaron ${n} pedidos vencidos` : 'No hay pedidos vencidos');
  });
}

// ---------- Usuarios ----------
export async function setUserStatusAction(userId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const admin = await assertAdmin();
    id(userId);
    const status = str(fd, 'status');
    if (status !== 'active' && status !== 'suspended') throw new AppError('Estado inválido');
    if (userId === admin.id) throw new AppError('No puedes cambiar el estado de tu propia cuenta');
    if (status === 'suspended') confirmed(fd);
    const reason = str(fd, 'reason', 500) || null;
    const [u] = await db.update(users).set({ status }).where(eq(users.id, userId)).returning({ id: users.id });
    if (!u) throw new AppError('Usuario no encontrado');
    if (status === 'suspended') await destroyAllSessions(userId);
    await audit(admin.id, status === 'suspended' ? 'user.suspended' : 'user.reactivated', 'user', userId, { reason });
    return done(status === 'suspended' ? 'Cuenta suspendida y sesiones cerradas' : 'Cuenta reactivada');
  });
}

export async function setAdminRoleAction(userId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const admin = await assertAdmin();
    id(userId);
    const grant = str(fd, 'grant') === '1';
    if (!grant && userId === admin.id) throw new AppError('No puedes quitarte tu propio rol de administrador');
    confirmed(fd);
    const [role] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, 'admin'));
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId));
    if (!role || !u) throw new AppError('Usuario no encontrado');
    if (grant) await db.insert(userRoles).values({ userId, roleId: role.id }).onConflictDoNothing();
    else await db.delete(userRoles).where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, role.id)));
    await audit(admin.id, grant ? 'user.admin_granted' : 'user.admin_revoked', 'user', userId);
    return done(grant ? 'Ahora es administrador' : 'Rol de administrador retirado');
  });
}

// ---------- Tiendas ----------
async function applyStoreStatus(adminId: string, storeId: string, status: 'active' | 'suspended', reason: string) {
  const [s] = await db.update(stores).set({ status }).where(eq(stores.id, storeId)).returning({ ownerId: stores.ownerId, name: stores.name });
  if (!s) throw new AppError('Tienda no encontrada');
  await notify(s.ownerId, status === 'suspended'
    ? { type: 'moderation', title: `Tu tienda ${s.name} fue suspendida`, body: `Motivo: ${reason}`, link: '/vendedor' }
    : { type: 'moderation', title: `Tu tienda ${s.name} fue reactivada`, body: reason, link: '/vendedor' }, { email: true });
  await audit(adminId, status === 'suspended' ? 'store.suspended' : 'store.reactivated', 'store', storeId, { reason });
}

export async function setStoreStatusAction(storeId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const admin = await assertAdmin();
    id(storeId);
    const status = str(fd, 'status');
    if (status !== 'active' && status !== 'suspended') throw new AppError('Estado inválido');
    if (status === 'suspended') confirmed(fd);
    await applyStoreStatus(admin.id, storeId, status, reasonOf(fd));
    return done(status === 'suspended' ? 'Tienda suspendida' : 'Tienda reactivada');
  });
}

// ---------- Productos ----------
async function applyProductModeration(adminId: string, productId: string, op: 'suspend' | 'reactivate' | 'archive', note: string | null) {
  const set = op === 'suspend' ? { status: 'suspended' as const, moderationNote: note }
    : op === 'archive' ? { status: 'archived' as const }
    : { status: 'active' as const, moderationNote: null };
  const [p] = await db.update(products).set(set).where(eq(products.id, productId)).returning({ title: products.title, storeId: products.storeId, publishedAt: products.publishedAt });
  if (!p) throw new AppError('Producto no encontrado');
  if (op === 'reactivate' && !p.publishedAt) await db.update(products).set({ publishedAt: new Date() }).where(eq(products.id, productId));
  const [s] = await db.select({ ownerId: stores.ownerId }).from(stores).where(eq(stores.id, p.storeId));
  if (s && op !== 'archive') {
    await notify(s.ownerId, op === 'suspend'
      ? { type: 'moderation', title: `Suspendimos tu producto "${p.title}"`, body: `Motivo: ${note}`, link: '/vendedor/productos' }
      : { type: 'moderation', title: `Tu producto "${p.title}" está publicado de nuevo`, link: '/vendedor/productos' }, { email: op === 'suspend' });
  }
  await audit(adminId, `product.${op === 'suspend' ? 'suspended' : op === 'archive' ? 'archived' : 'reactivated'}`, 'product', productId, { note });
}

export async function moderateProductAction(productId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const admin = await assertAdmin();
    id(productId);
    const op = str(fd, 'op');
    if (op !== 'suspend' && op !== 'reactivate' && op !== 'archive') throw new AppError('Acción inválida');
    if (op !== 'reactivate') confirmed(fd);
    await applyProductModeration(admin.id, productId, op, op === 'suspend' ? reasonOf(fd) : null);
    return done(op === 'suspend' ? 'Producto suspendido' : op === 'archive' ? 'Producto archivado' : 'Producto publicado');
  });
}

// ---------- Pedidos ----------
export async function refundOrderAction(orderId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const admin = await assertAdmin();
    id(orderId);
    confirmed(fd);
    const [o] = await db.select({ status: orders.status, number: orders.number }).from(orders).where(eq(orders.id, orderId));
    if (!o) throw new AppError('Pedido no encontrado');
    if (o.status === 'refunded') throw new AppError('Este pedido ya fue reembolsado');
    await refundOrder(orderId, admin.id);
    return done(`Reembolso solicitado para ${orderNumber(o.number)}`);
  });
}

// ---------- Comisiones ----------
function parseRate(fd: FormData) {
  const bps = percentToBps(str(fd, 'rate', 10));
  if (bps == null) throw new AppError('Escribe un porcentaje entre 0 y 50 (máximo 2 decimales)');
  return bps;
}

export async function saveCommissionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const admin = await assertAdmin();
    const rateBps = parseRate(fd);
    const raw = str(fd, 'categoryId');
    if (!raw) {
      // La regla global tiene category_id NULL (el índice único no evita varios NULL, así que se actualiza o inserta a mano).
      const up = await db.update(platformCommissions).set({ rateBps, updatedBy: admin.id }).where(isNull(platformCommissions.categoryId)).returning({ id: platformCommissions.id });
      if (!up.length) await db.insert(platformCommissions).values({ categoryId: null, rateBps, updatedBy: admin.id });
    } else {
      const categoryId = int(fd, 'categoryId');
      if (Number.isNaN(categoryId)) throw new AppError('Elige una categoría');
      const [c] = await db.select({ id: categories.id }).from(categories).where(eq(categories.id, categoryId));
      if (!c) throw new AppError('Elige una categoría');
      await db.insert(platformCommissions).values({ categoryId, rateBps, updatedBy: admin.id })
        .onConflictDoUpdate({ target: platformCommissions.categoryId, set: { rateBps, updatedBy: admin.id } });
    }
    await audit(admin.id, 'commission.updated', 'commission', raw || 'global', { rateBps });
    return done('Comisión guardada. Aplica a los pedidos nuevos.');
  });
}

export async function deleteCommissionAction(ruleId: number, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const admin = await assertAdmin();
    confirmed(fd);
    // La regla global (category_id NULL) no se puede borrar.
    const del = Number.isInteger(ruleId)
      ? await db.delete(platformCommissions).where(and(eq(platformCommissions.id, ruleId), isNotNull(platformCommissions.categoryId))).returning()
      : [];
    if (!del.length) throw new AppError('Regla no encontrada');
    await audit(admin.id, 'commission.deleted', 'commission', String(del[0].categoryId), { rateBps: del[0].rateBps });
    return done('Excepción eliminada: la categoría usa la comisión global');
  });
}

// ---------- Categorías ----------
export async function saveCategoryAction(categoryId: number | null, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const admin = await assertAdmin();
    const name = str(fd, 'name', 60);
    if (name.length < 2) throw new AppError('El nombre debe tener al menos 2 caracteres');
    const slug = slugify(str(fd, 'slug', 80) || name);
    if (slug.length < 2) throw new AppError('El identificador (slug) necesita letras o números');
    if (categoryId != null && !Number.isInteger(categoryId)) throw new AppError('Categoría no encontrada');
    const parentId = str(fd, 'parentId') ? int(fd, 'parentId') : null;
    if (Number.isNaN(parentId)) throw new AppError('Categoría padre inválida');
    const position = str(fd, 'position') ? int(fd, 'position') : 0;
    if (!Number.isInteger(position) || Math.abs(position) > 100_000) throw new AppError('Posición inválida');
    const active = fd.get('active') === 'on';

    if (parentId != null) {
      if (parentId === categoryId) throw new AppError('Una categoría no puede ser su propio padre');
      const [parent] = await db.select({ parentId: categories.parentId }).from(categories).where(eq(categories.id, parentId));
      if (!parent) throw new AppError('Categoría padre no encontrada');
      if (parent.parentId != null) throw new AppError('Solo se permiten dos niveles: elige una categoría principal como padre');
      if (categoryId != null) {
        const [kids] = await db.select({ n: count() }).from(categories).where(eq(categories.parentId, categoryId));
        if (kids.n) throw new AppError('Esta categoría tiene subcategorías: no puede convertirse en subcategoría');
      }
    }
    const [taken] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, slug));
    if (taken && taken.id !== categoryId) throw new AppError(`El slug "${slug}" ya está en uso`);

    const values = { name, slug, parentId, position, active };
    if (categoryId == null) {
      const [c] = await db.insert(categories).values(values).returning({ id: categories.id });
      await audit(admin.id, 'category.created', 'category', String(c.id), values);
      return done('Categoría creada');
    }
    const up = await db.update(categories).set(values).where(eq(categories.id, categoryId)).returning({ id: categories.id });
    if (!up.length) throw new AppError('Categoría no encontrada');
    await audit(admin.id, 'category.updated', 'category', String(categoryId), values);
    return done('Categoría actualizada');
  });
}

export async function deleteCategoryAction(categoryId: number, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const admin = await assertAdmin();
    confirmed(fd);
    if (!Number.isInteger(categoryId)) throw new AppError('Categoría no encontrada');
    const [[p], [k]] = await Promise.all([
      db.select({ n: count() }).from(products).where(eq(products.categoryId, categoryId)),
      db.select({ n: count() }).from(categories).where(eq(categories.parentId, categoryId)),
    ]);
    if (k.n) throw new AppError(`No se puede eliminar: tiene ${k.n} subcategorías`);
    if (p.n) throw new AppError(`No se puede eliminar: tiene ${p.n} productos. Desactívala o mueve los productos.`);
    try {
      const del = await db.delete(categories).where(eq(categories.id, categoryId)).returning({ name: categories.name });
      if (!del.length) throw new AppError('Categoría no encontrada');
      await audit(admin.id, 'category.deleted', 'category', String(categoryId), { name: del[0].name });
    } catch (e) {
      if ((e as { code?: string })?.code === '23503' || (e as { cause?: { code?: string } })?.cause?.code === '23503') {
        throw new AppError('No se puede eliminar: otros registros dependen de esta categoría');
      }
      throw e;
    }
    return done('Categoría eliminada');
  });
}

// ---------- Reportes ----------
export async function resolveReportAction(reportId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const admin = await assertAdmin();
    id(reportId);
    const outcome = str(fd, 'outcome');
    if (outcome !== 'resolved' && outcome !== 'dismissed') throw new AppError('Elige cómo cerrar el reporte');
    const note = str(fd, 'reason', 500) || null;
    const quick = str(fd, 'quick');
    const [r] = await db.select().from(reports).where(eq(reports.id, reportId));
    if (!r) throw new AppError('Reporte no encontrado');
    if (r.status !== 'open') throw new AppError('Este reporte ya está cerrado');

    // La acción rápida se aplica al objetivo guardado en el reporte, nunca a un id del formulario.
    if (quick && outcome === 'resolved') {
      if (quick === 'hide_review' && r.targetType === 'review') await setReviewStatus(admin.id, r.targetId, 'hidden');
      else if (quick === 'suspend_product' && r.targetType === 'product') {
        if (!note || note.length < 3) throw new AppError('Escribe una nota: se enviará a la tienda como motivo');
        await applyProductModeration(admin.id, r.targetId, 'suspend', note);
      } else if (quick === 'suspend_store' && r.targetType === 'store') {
        if (!note || note.length < 3) throw new AppError('Escribe una nota: se enviará a la tienda como motivo');
        await applyStoreStatus(admin.id, r.targetId, 'suspended', note);
      } else throw new AppError('Acción rápida no válida para este reporte');
    }
    await db.update(reports).set({ status: outcome, resolvedBy: admin.id, resolvedAt: new Date(), resolutionNote: note }).where(eq(reports.id, reportId));
    await audit(admin.id, `report.${outcome}`, 'report', reportId, { quick: quick || null, note });
    return done(outcome === 'resolved' ? 'Reporte resuelto' : 'Reporte descartado');
  });
}

// ---------- Reseñas ----------
export async function setReviewStatusAction(reviewId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const admin = await assertAdmin();
    id(reviewId);
    const status = str(fd, 'status');
    if (status !== 'published' && status !== 'hidden') throw new AppError('Estado inválido');
    if (status === 'hidden') confirmed(fd);
    await setReviewStatus(admin.id, reviewId, status); // registra la auditoría
    return done(status === 'hidden' ? 'Reseña oculta' : 'Reseña publicada');
  });
}

// ---------- Configuración ----------
export async function saveSettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const admin = await assertAdmin();
    const supportEmail = str(fd, 'supportEmail', 200).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) throw new AppError('Escribe un correo de soporte válido');
    await db.insert(platformSettings).values({ key: 'supportEmail', value: supportEmail })
      .onConflictDoUpdate({ target: platformSettings.key, set: { value: supportEmail } });
    await audit(admin.id, 'settings.updated', 'settings', 'supportEmail', { supportEmail });
    return done('Configuración guardada');
  });
}
