import 'server-only';
import { and, count, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { rowsOf } from '@/lib/db/client';
import { PROVIDERS } from '@/lib/payments/providers';

export { likeTerm } from './format';

const { orders, sellerOrders, stores, auditLogs, emailOutbox, reports } = schema;

export const PAGE_SIZE = 25;
export type SP = Record<string, string | string[] | undefined>;

/** Primer valor de un parámetro de búsqueda, recortado. */
export const one = (v: string | string[] | undefined) => ((Array.isArray(v) ? v[0] : v) ?? '').trim().slice(0, 200);
/** Devuelve el valor si está en la lista permitida; si no, ''. Evita pasar valores arbitrarios a columnas enum. */
export const oneOf = <T extends string>(v: string | string[] | undefined, allowed: readonly T[]) => {
  const s = one(v);
  return (allowed as readonly string[]).includes(s) ? (s as T) : '';
};
export const pageOf = (sp: SP) => {
  const n = Number(one(sp.page));
  return Number.isInteger(n) && n > 0 && n < 10_000 ? n : 1;
};
/** URL de la misma lista con otra página, conservando los filtros. */
export const pageHref = (base: string, sp: SP) => (page: number) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (k !== 'page' && one(v)) p.set(k, one(v));
  if (page > 1) p.set('page', String(page));
  const qs = p.toString();
  return qs ? `${base}?${qs}` : base;
};
export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export const money = (expr: SQL) => sql<number>`coalesce(${expr}, 0)`.mapWith(Number);
/** Sub-pedidos que generan comisión (pagados y en curso o entregados). */
export const EARNING_STATUSES = ['paid', 'processing', 'shipped', 'delivered'] as const;
export const FLAGGED_PAYMENT_ACTIONS = ['payment.mismatch', 'payment.paid-but-closed'];

/** Solo booleanos: nunca se exponen llaves ni secretos. */
export function integrationStatus() {
  return [
    ...Object.values(PROVIDERS).map((p) => ({ label: p.label, ok: p.isConfigured() })),
    { label: 'Correo (Gmail / SMTP)', ok: !!process.env.SMTP_USER && !!process.env.SMTP_PASS },
    { label: 'Correo (Resend)', ok: !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM },
  ];
}

export async function getOverview() {
  const earning = inArray(sellerOrders.status, [...EARNING_STATUSES]);
  const [[users], [activeStores], [published], [gmv], [fees], byStatus, [openReports], [flagged], [failedEmails], topStores, daily] = await Promise.all([
    db.select({ n: count() }).from(schema.users),
    db.select({ n: count() }).from(stores).where(eq(stores.status, 'active')),
    db.select({ n: count() }).from(schema.products).where(eq(schema.products.status, 'active')),
    db.select({ v: money(sql`sum(${orders.total})`) }).from(orders).where(inArray(orders.status, ['paid', 'completed'])),
    db.select({ v: money(sql`sum(${sellerOrders.commissionAmount})`) }).from(sellerOrders).where(earning),
    db.select({ status: orders.status, n: count() }).from(orders).groupBy(orders.status),
    db.select({ n: count() }).from(reports).where(eq(reports.status, 'open')),
    db.select({ n: count() }).from(auditLogs).where(inArray(auditLogs.action, FLAGGED_PAYMENT_ACTIONS)),
    db.select({ n: count() }).from(emailOutbox).where(eq(emailOutbox.status, 'failed')),
    db.select({ name: stores.name, slug: stores.slug, v: money(sql`sum(${sellerOrders.total})`) })
      .from(sellerOrders).innerJoin(stores, eq(stores.id, sellerOrders.storeId)).where(earning)
      .groupBy(stores.id, stores.name, stores.slug).orderBy(desc(sql`sum(${sellerOrders.total})`)).limit(6),
    db.execute(sql`
      select to_char(d, 'DD/MM') as label, coalesce(sum(o.total), 0)::float8 as value
      from generate_series(current_date - 29, current_date, interval '1 day') d
      left join orders o on o.paid_at::date = d::date and o.status in ('paid', 'completed')
      group by d order by d`),
  ]);
  const status = Object.fromEntries(byStatus.map((r) => [r.status, r.n])) as Record<string, number>;
  return {
    users: users.n, activeStores: activeStores.n, published: published.n, gmv: gmv.v, fees: fees.v,
    completed: status.completed ?? 0, cancelled: status.cancelled ?? 0, refunded: status.refunded ?? 0,
    openReports: openReports.n, flagged: flagged.n, failedEmails: failedEmails.n,
    topStores: topStores.map((s) => ({ label: s.name, value: s.v, href: `/tienda/${s.slug}` })),
    daily: rowsOf<{ label: string; value: number }>(daily).map((r) => ({ label: r.label, value: Number(r.value) })),
  };
}

/** Pagos señalados por el webhook (monto distinto o pagado con el pedido ya cerrado). */
export async function flaggedPayments(limit = 50) {
  return db.select({
    id: auditLogs.id, action: auditLogs.action, metadata: auditLogs.metadata, createdAt: auditLogs.createdAt,
    paymentId: auditLogs.entityId, orderId: orders.id, orderNumber: orders.number, provider: schema.payments.provider, status: schema.payments.status,
  }).from(auditLogs)
    .leftJoin(schema.payments, sql`${schema.payments.id}::text = ${auditLogs.entityId}`)
    .leftJoin(orders, eq(orders.id, schema.payments.orderId))
    .where(and(inArray(auditLogs.action, FLAGGED_PAYMENT_ACTIONS), eq(auditLogs.entityType, 'payment')))
    .orderBy(desc(auditLogs.createdAt)).limit(limit);
}
