/**
 * Esquema relacional del marketplace.
 * Convenciones: dinero en centavos (integer), comisiones en puntos base (1% = 100 bps),
 * fechas con zona horaria, nombres en snake_case (drizzle `casing`).
 */
import { relations, sql } from 'drizzle-orm';
import {
  pgTable, pgEnum, uuid, text, integer, smallint, boolean, timestamp, jsonb, serial, bigserial, bigint,
  primaryKey, index, uniqueIndex, check, customType, numeric, type AnyPgColumn,
} from 'drizzle-orm/pg-core';

const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' });
const createdAt = () => timestamp({ withTimezone: true }).defaultNow().notNull();
const updatedAt = () => timestamp({ withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date());

// ---------- Enums ----------
export const userStatus = pgEnum('user_status', ['active', 'suspended']);
export const roleKey = pgEnum('role_key', ['buyer', 'seller', 'admin']);
export const tokenType = pgEnum('token_type', ['verify_email', 'reset_password']);
export const storeStatus = pgEnum('store_status', ['active', 'suspended']);
export const productStatus = pgEnum('product_status', ['draft', 'active', 'paused', 'suspended', 'archived']);
export const productCondition = pgEnum('product_condition', ['new', 'used', 'refurbished']);
export const orderStatus = pgEnum('order_status', ['pending_payment', 'paid', 'completed', 'cancelled', 'refunded']);
export const sellerOrderStatus = pgEnum('seller_order_status', ['pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']);
export const payoutStatus = pgEnum('payout_status', ['held', 'eligible', 'paid_out']);
export const paymentProvider = pgEnum('payment_provider', ['sandbox', 'stripe', 'mercadopago']);
export const paymentStatus = pgEnum('payment_status', ['created', 'pending', 'approved', 'rejected', 'cancelled', 'refunded', 'partially_refunded']);
export const shipmentStatus = pgEnum('shipment_status', ['pending', 'in_transit', 'delivered', 'returned']);
export const reviewStatus = pgEnum('review_status', ['published', 'hidden']);
export const couponType = pgEnum('coupon_type', ['percent', 'fixed']);
export const reportTarget = pgEnum('report_target', ['product', 'review', 'store', 'user']);
export const reportStatus = pgEnum('report_status', ['open', 'resolved', 'dismissed']);
export const emailStatus = pgEnum('email_status', ['pending', 'sent', 'failed', 'captured']);

// ---------- Usuarios y acceso ----------
export const users = pgTable('users', {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull(),
  name: text().notNull(),
  passwordHash: text().notNull(),
  emailVerifiedAt: timestamp({ withTimezone: true }),
  status: userStatus().default('active').notNull(),
  avatarUrl: text(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('users_email_lower_idx').on(sql`lower(${t.email})`)]);

export const roles = pgTable('roles', {
  id: serial().primaryKey(),
  key: roleKey().notNull().unique(),
  name: text().notNull(),
});

export const userRoles = pgTable('user_roles', {
  userId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  roleId: integer().notNull().references(() => roles.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.userId, t.roleId] })]);

/** El id es el SHA-256 del token de la cookie: si la tabla se filtra, no sirve para iniciar sesión. */
export const sessions = pgTable('sessions', {
  id: text().primaryKey(),
  userId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  ip: text(),
  userAgent: text(),
  createdAt: createdAt(),
}, (t) => [index('sessions_user_idx').on(t.userId)]);

export const authTokens = pgTable('auth_tokens', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: tokenType().notNull(),
  tokenHash: text().notNull().unique(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  usedAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index('auth_tokens_user_idx').on(t.userId, t.type)]);

// ---------- Vendedores y tiendas ----------
export const sellerProfiles = pgTable('seller_profiles', {
  userId: uuid().primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  legalName: text().notNull(),
  phone: text().notNull(),
  taxId: text(), // RFC (opcional al inicio; obligatorio antes de liquidar pagos)
  acceptedTermsAt: timestamp({ withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const stores = pgTable('stores', {
  id: uuid().primaryKey().defaultRandom(),
  ownerId: uuid().notNull().unique().references(() => users.id, { onDelete: 'restrict' }),
  slug: text().notNull().unique(),
  name: text().notNull(),
  description: text().default('').notNull(),
  logoUrl: text(),
  bannerUrl: text(),
  city: text(),
  state: text(),
  status: storeStatus().default('active').notNull(),
  shippingFlat: integer().default(9900).notNull(),
  freeShippingOver: integer(), // null = nunca gratis
  processingDays: smallint().default(2).notNull(),
  // Agregados mantenidos en transacción (evitan recalcular en cada visita)
  ratingAvg: numeric({ precision: 3, scale: 2, mode: 'number' }).default(0).notNull(),
  ratingCount: integer().default(0).notNull(),
  salesCount: integer().default(0).notNull(),
  isDemo: boolean().default(false).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  check('stores_shipping_chk', sql`${t.shippingFlat} >= 0`),
]);

export const storeFollowers = pgTable('store_followers', {
  userId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  storeId: uuid().notNull().references(() => stores.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.userId, t.storeId] }), index('store_followers_store_idx').on(t.storeId)]);

// ---------- Catálogo ----------
export const categories = pgTable('categories', {
  id: serial().primaryKey(),
  parentId: integer().references((): AnyPgColumn => categories.id, { onDelete: 'restrict' }),
  slug: text().notNull().unique(),
  name: text().notNull(),
  icon: text(),
  position: integer().default(0).notNull(),
  active: boolean().default(true).notNull(),
  createdAt: createdAt(),
}, (t) => [index('categories_parent_idx').on(t.parentId)]);

export const products = pgTable('products', {
  id: uuid().primaryKey().defaultRandom(),
  storeId: uuid().notNull().references(() => stores.id, { onDelete: 'cascade' }),
  categoryId: integer().notNull().references(() => categories.id, { onDelete: 'restrict' }),
  slug: text().notNull().unique(),
  title: text().notNull(),
  description: text().default('').notNull(),
  brand: text(),
  condition: productCondition().default('new').notNull(),
  status: productStatus().default('draft').notNull(),
  price: integer().notNull(),
  salePrice: integer(), // precio de oferta
  sku: text(),
  weightGrams: integer(),
  lengthCm: integer(),
  widthCm: integer(),
  heightCm: integer(),
  shippingInfo: text(),
  ratingAvg: numeric({ precision: 3, scale: 2, mode: 'number' }).default(0).notNull(),
  ratingCount: integer().default(0).notNull(),
  salesCount: integer().default(0).notNull(),
  moderationNote: text(),
  isDemo: boolean().default(false).notNull(),
  searchVector: tsvector().generatedAlwaysAs(
    sql`setweight(to_tsvector('spanish', immutable_unaccent(coalesce(title, ''))), 'A') ||
        setweight(to_tsvector('spanish', immutable_unaccent(coalesce(brand, ''))), 'B') ||
        setweight(to_tsvector('spanish', immutable_unaccent(coalesce(description, ''))), 'C')`,
  ),
  publishedAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index('products_store_idx').on(t.storeId, t.status),
  index('products_category_idx').on(t.categoryId, t.status),
  index('products_status_published_idx').on(t.status, t.publishedAt),
  index('products_search_idx').using('gin', t.searchVector),
  index('products_title_trgm_idx').using('gin', sql`immutable_unaccent(lower(${t.title})) gin_trgm_ops`),
  check('products_price_chk', sql`${t.price} > 0`),
  check('products_sale_chk', sql`${t.salePrice} IS NULL OR (${t.salePrice} > 0 AND ${t.salePrice} < ${t.price})`),
]);

export const productImages = pgTable('product_images', {
  id: uuid().primaryKey().defaultRandom(),
  productId: uuid().notNull().references(() => products.id, { onDelete: 'cascade' }),
  url: text().notNull(),
  thumbUrl: text(),
  alt: text(),
  width: integer(),
  height: integer(),
  position: integer().default(0).notNull(),
  createdAt: createdAt(),
}, (t) => [index('product_images_product_idx').on(t.productId, t.position)]);

export const productVariants = pgTable('product_variants', {
  id: uuid().primaryKey().defaultRandom(),
  productId: uuid().notNull().references(() => products.id, { onDelete: 'cascade' }),
  name: text().notNull(), // "M / Rojo" o "Único"
  options: jsonb().$type<Record<string, string>>().default({}).notNull(),
  sku: text(),
  priceOverride: integer(),
  stock: integer().default(0).notNull(),
  position: integer().default(0).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index('product_variants_product_idx').on(t.productId),
  check('product_variants_stock_chk', sql`${t.stock} >= 0`),
]);

/** Bitácora de inventario: cada cambio de existencias queda registrado con su motivo. */
export const inventoryMovements = pgTable('inventory_movements', {
  id: bigserial({ mode: 'number' }).primaryKey(),
  variantId: uuid().notNull().references(() => productVariants.id, { onDelete: 'cascade' }),
  delta: integer().notNull(),
  reason: text().notNull(), // initial | adjust | order | order_cancel | refund
  refId: uuid(),
  actorId: uuid().references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
}, (t) => [index('inventory_movements_variant_idx').on(t.variantId)]);

// ---------- Carrito, direcciones y cupones ----------
export const carts = pgTable('carts', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid().unique().references(() => users.id, { onDelete: 'cascade' }),
  guestTokenHash: text().unique(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const cartItems = pgTable('cart_items', {
  cartId: uuid().notNull().references(() => carts.id, { onDelete: 'cascade' }),
  variantId: uuid().notNull().references(() => productVariants.id, { onDelete: 'cascade' }),
  quantity: integer().notNull(),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.cartId, t.variantId] }), check('cart_items_qty_chk', sql`${t.quantity} BETWEEN 1 AND 99`)]);

export const addresses = pgTable('addresses', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  recipientName: text().notNull(),
  phone: text().notNull(),
  street: text().notNull(),
  extNumber: text().notNull(),
  intNumber: text(),
  neighborhood: text().notNull(),
  city: text().notNull(),
  state: text().notNull(),
  postalCode: text().notNull(),
  country: text().default('MX').notNull(),
  references: text(),
  isDefault: boolean().default(false).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('addresses_user_idx').on(t.userId)]);

export const coupons = pgTable('coupons', {
  id: uuid().primaryKey().defaultRandom(),
  storeId: uuid().notNull().references(() => stores.id, { onDelete: 'cascade' }),
  code: text().notNull(),
  type: couponType().notNull(),
  value: integer().notNull(), // % (1-90) o centavos
  minSubtotal: integer().default(0).notNull(),
  maxUses: integer(),
  uses: integer().default(0).notNull(),
  startsAt: timestamp({ withTimezone: true }),
  endsAt: timestamp({ withTimezone: true }),
  active: boolean().default(true).notNull(),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('coupons_store_code_idx').on(t.storeId, sql`upper(${t.code})`),
  check('coupons_value_chk', sql`${t.value} > 0 AND (${t.type} = 'fixed' OR ${t.value} <= 90)`),
]);

// ---------- Pedidos ----------
export const orders = pgTable('orders', {
  id: uuid().primaryKey().defaultRandom(),
  number: bigint({ mode: 'number' }).generatedAlwaysAsIdentity({ startWith: 100001 }).notNull().unique(),
  buyerId: uuid().notNull().references(() => users.id, { onDelete: 'restrict' }),
  status: orderStatus().default('pending_payment').notNull(),
  subtotal: integer().notNull(),
  discountTotal: integer().default(0).notNull(),
  shippingTotal: integer().default(0).notNull(),
  total: integer().notNull(),
  currency: text().default('MXN').notNull(),
  // Copia de la dirección al momento de comprar: es el registro legal de la entrega.
  shippingAddress: jsonb().$type<AddressSnapshot>().notNull(),
  buyerName: text().notNull(),
  buyerEmail: text().notNull(),
  expiresAt: timestamp({ withTimezone: true }),
  paidAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('orders_buyer_idx').on(t.buyerId, t.createdAt), index('orders_status_idx').on(t.status)]);

export const sellerOrders = pgTable('seller_orders', {
  id: uuid().primaryKey().defaultRandom(),
  orderId: uuid().notNull().references(() => orders.id, { onDelete: 'cascade' }),
  storeId: uuid().notNull().references(() => stores.id, { onDelete: 'restrict' }),
  status: sellerOrderStatus().default('pending_payment').notNull(),
  subtotal: integer().notNull(),
  discount: integer().default(0).notNull(),
  shipping: integer().default(0).notNull(),
  total: integer().notNull(),
  couponId: uuid().references(() => coupons.id, { onDelete: 'set null' }),
  couponCode: text(),
  commissionRateBps: integer().notNull(),
  commissionAmount: integer().notNull(),
  sellerNet: integer().notNull(),
  // El dinero del vendedor queda retenido hasta que exista un mecanismo real de liquidación.
  payoutStatus: payoutStatus().default('held').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex('seller_orders_order_store_idx').on(t.orderId, t.storeId),
  index('seller_orders_store_idx').on(t.storeId, t.status, t.createdAt),
]);

export const orderItems = pgTable('order_items', {
  id: uuid().primaryKey().defaultRandom(),
  sellerOrderId: uuid().notNull().references(() => sellerOrders.id, { onDelete: 'cascade' }),
  productId: uuid().references(() => products.id, { onDelete: 'set null' }),
  variantId: uuid().references(() => productVariants.id, { onDelete: 'set null' }),
  title: text().notNull(),
  variantName: text().notNull(),
  imageUrl: text(),
  unitPrice: integer().notNull(),
  quantity: integer().notNull(),
  lineTotal: integer().notNull(),
  createdAt: createdAt(),
}, (t) => [index('order_items_seller_order_idx').on(t.sellerOrderId), index('order_items_product_idx').on(t.productId)]);

// ---------- Pagos ----------
export const payments = pgTable('payments', {
  id: uuid().primaryKey().defaultRandom(),
  orderId: uuid().notNull().references(() => orders.id, { onDelete: 'restrict' }),
  provider: paymentProvider().notNull(),
  providerPaymentId: text(),
  status: paymentStatus().default('created').notNull(),
  amount: integer().notNull(),
  amountRefunded: integer().default(0).notNull(),
  currency: text().default('MXN').notNull(),
  checkoutUrl: text(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index('payments_order_idx').on(t.orderId),
  uniqueIndex('payments_provider_ref_idx').on(t.provider, t.providerPaymentId),
]);

/** Historial inmutable de eventos de pago. El índice único evita procesar dos veces el mismo webhook. */
export const paymentTransactions = pgTable('payment_transactions', {
  id: bigserial({ mode: 'number' }).primaryKey(),
  paymentId: uuid().notNull().references(() => payments.id, { onDelete: 'restrict' }),
  provider: paymentProvider().notNull(),
  type: text().notNull(), // checkout_created | webhook | refund | status_change
  providerEventId: text(),
  status: paymentStatus(),
  amount: integer(),
  data: jsonb(),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('payment_tx_event_idx').on(t.provider, t.providerEventId),
  index('payment_tx_payment_idx').on(t.paymentId),
]);

/** Reglas de comisión: una fila global (category_id NULL) y excepciones por categoría. */
export const platformCommissions = pgTable('platform_commissions', {
  id: serial().primaryKey(),
  categoryId: integer().unique().references(() => categories.id, { onDelete: 'cascade' }),
  rateBps: integer().notNull(),
  updatedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [check('platform_commissions_rate_chk', sql`${t.rateBps} BETWEEN 0 AND 5000`)]);

// ---------- Envíos ----------
export const shipments = pgTable('shipments', {
  id: uuid().primaryKey().defaultRandom(),
  sellerOrderId: uuid().notNull().unique().references(() => sellerOrders.id, { onDelete: 'cascade' }),
  carrier: text(),
  trackingNumber: text(),
  status: shipmentStatus().default('pending').notNull(),
  shippedAt: timestamp({ withTimezone: true }),
  deliveredAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const shipmentEvents = pgTable('shipment_events', {
  id: bigserial({ mode: 'number' }).primaryKey(),
  shipmentId: uuid().notNull().references(() => shipments.id, { onDelete: 'cascade' }),
  status: shipmentStatus().notNull(),
  description: text().notNull(),
  location: text(),
  createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
  occurredAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('shipment_events_shipment_idx').on(t.shipmentId)]);

// ---------- Reseñas ----------
export const reviews = pgTable('reviews', {
  id: uuid().primaryKey().defaultRandom(),
  productId: uuid().notNull().references(() => products.id, { onDelete: 'cascade' }),
  storeId: uuid().notNull().references(() => stores.id, { onDelete: 'cascade' }),
  userId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  orderItemId: uuid().notNull().unique().references(() => orderItems.id, { onDelete: 'restrict' }),
  rating: smallint().notNull(),
  title: text(),
  body: text().notNull(),
  verified: boolean().default(true).notNull(),
  status: reviewStatus().default('published').notNull(),
  helpfulCount: integer().default(0).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex('reviews_user_product_idx').on(t.userId, t.productId), // una reseña por producto y persona
  index('reviews_product_idx').on(t.productId, t.status, t.createdAt),
  index('reviews_store_idx').on(t.storeId),
  check('reviews_rating_chk', sql`${t.rating} BETWEEN 1 AND 5`),
]);

export const reviewImages = pgTable('review_images', {
  id: uuid().primaryKey().defaultRandom(),
  reviewId: uuid().notNull().references(() => reviews.id, { onDelete: 'cascade' }),
  url: text().notNull(),
  thumbUrl: text(),
  position: integer().default(0).notNull(),
}, (t) => [index('review_images_review_idx').on(t.reviewId)]);

export const reviewResponses = pgTable('review_responses', {
  id: uuid().primaryKey().defaultRandom(),
  reviewId: uuid().notNull().unique().references(() => reviews.id, { onDelete: 'cascade' }),
  storeId: uuid().notNull().references(() => stores.id, { onDelete: 'cascade' }),
  authorId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  body: text().notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const reviewVotes = pgTable('review_votes', {
  reviewId: uuid().notNull().references(() => reviews.id, { onDelete: 'cascade' }),
  userId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.reviewId, t.userId] })]);

// ---------- Preguntas al vendedor ----------
export const questionStatus = pgEnum('question_status', ['published', 'hidden']);
export const productQuestions = pgTable('product_questions', {
  id: uuid().primaryKey().defaultRandom(),
  productId: uuid().notNull().references(() => products.id, { onDelete: 'cascade' }),
  storeId: uuid().notNull().references(() => stores.id, { onDelete: 'cascade' }),
  userId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  body: text().notNull(),
  answer: text(),
  answeredBy: uuid().references(() => users.id, { onDelete: 'set null' }),
  answeredAt: timestamp({ withTimezone: true }),
  status: questionStatus().default('published').notNull(),
  createdAt: createdAt(),
}, (t) => [
  index('product_questions_product_idx').on(t.productId, t.status, t.createdAt),
  index('product_questions_store_idx').on(t.storeId, t.answeredAt),
]);

// ---------- Comunidad y moderación ----------
export const favorites = pgTable('favorites', {
  userId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  productId: uuid().notNull().references(() => products.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.userId, t.productId] })]);

export const reports = pgTable('reports', {
  id: uuid().primaryKey().defaultRandom(),
  reporterId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  targetType: reportTarget().notNull(),
  targetId: uuid().notNull(),
  reason: text().notNull(),
  details: text(),
  status: reportStatus().default('open').notNull(),
  resolvedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
  resolvedAt: timestamp({ withTimezone: true }),
  resolutionNote: text(),
  createdAt: createdAt(),
}, (t) => [
  index('reports_status_idx').on(t.status, t.createdAt),
  uniqueIndex('reports_once_idx').on(t.reporterId, t.targetType, t.targetId), // un reporte por persona y objetivo
]);

export const notifications = pgTable('notifications', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text().notNull(),
  title: text().notNull(),
  body: text(),
  link: text(),
  readAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index('notifications_user_idx').on(t.userId, t.readAt, t.createdAt)]);

// ---------- Sistema ----------
export const emailOutbox = pgTable('email_outbox', {
  id: uuid().primaryKey().defaultRandom(),
  to: text().notNull(),
  subject: text().notNull(),
  html: text().notNull(),
  status: emailStatus().default('pending').notNull(),
  providerId: text(),
  error: text(),
  createdAt: createdAt(),
  sentAt: timestamp({ withTimezone: true }),
}, (t) => [index('email_outbox_status_idx').on(t.status, t.createdAt)]);

export const auditLogs = pgTable('audit_logs', {
  id: bigserial({ mode: 'number' }).primaryKey(),
  actorId: uuid().references(() => users.id, { onDelete: 'set null' }),
  action: text().notNull(),
  entityType: text().notNull(),
  entityId: text(),
  metadata: jsonb(),
  ip: text(),
  createdAt: createdAt(),
}, (t) => [index('audit_logs_entity_idx').on(t.entityType, t.entityId), index('audit_logs_actor_idx').on(t.actorId, t.createdAt)]);

export const rateLimits = pgTable('rate_limits', {
  key: text().primaryKey(),
  count: integer().notNull(),
  resetAt: timestamp({ withTimezone: true }).notNull(),
});

/** Imágenes guardadas en la base (driver "db" de storage.ts): para hosting sin disco persistente, como Vercel. */
const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });
export const media = pgTable('media', {
  key: text().primaryKey(),
  data: bytea().notNull(),
  contentType: text().notNull(),
  createdAt: createdAt(),
});

export const platformSettings = pgTable('platform_settings', {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  updatedAt: updatedAt(),
});

export type AddressSnapshot = {
  recipientName: string; phone: string; street: string; extNumber: string; intNumber?: string | null;
  neighborhood: string; city: string; state: string; postalCode: string; country: string; references?: string | null;
};

// ---------- Relaciones (para db.query) ----------
export const usersRelations = relations(users, ({ many, one }) => ({
  roles: many(userRoles), store: one(stores, { fields: [users.id], references: [stores.ownerId] }),
}));
export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, { fields: [userRoles.userId], references: [users.id] }),
  role: one(roles, { fields: [userRoles.roleId], references: [roles.id] }),
}));
export const storesRelations = relations(stores, ({ one, many }) => ({
  owner: one(users, { fields: [stores.ownerId], references: [users.id] }), products: many(products),
}));
export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, { fields: [categories.parentId], references: [categories.id], relationName: 'tree' }),
  children: many(categories, { relationName: 'tree' }),
}));
export const productsRelations = relations(products, ({ one, many }) => ({
  store: one(stores, { fields: [products.storeId], references: [stores.id] }),
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  images: many(productImages), variants: many(productVariants),
}));
export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, { fields: [productImages.productId], references: [products.id] }),
}));
export const productVariantsRelations = relations(productVariants, ({ one }) => ({
  product: one(products, { fields: [productVariants.productId], references: [products.id] }),
}));
export const ordersRelations = relations(orders, ({ many, one }) => ({
  sellerOrders: many(sellerOrders), payments: many(payments), buyer: one(users, { fields: [orders.buyerId], references: [users.id] }),
}));
export const sellerOrdersRelations = relations(sellerOrders, ({ one, many }) => ({
  order: one(orders, { fields: [sellerOrders.orderId], references: [orders.id] }),
  store: one(stores, { fields: [sellerOrders.storeId], references: [stores.id] }),
  items: many(orderItems),
  shipment: one(shipments, { fields: [sellerOrders.id], references: [shipments.sellerOrderId] }),
}));
export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  sellerOrder: one(sellerOrders, { fields: [orderItems.sellerOrderId], references: [sellerOrders.id] }),
  review: one(reviews, { fields: [orderItems.id], references: [reviews.orderItemId] }),
}));
export const shipmentsRelations = relations(shipments, ({ one, many }) => ({
  sellerOrder: one(sellerOrders, { fields: [shipments.sellerOrderId], references: [sellerOrders.id] }),
  events: many(shipmentEvents),
}));
export const shipmentEventsRelations = relations(shipmentEvents, ({ one }) => ({
  shipment: one(shipments, { fields: [shipmentEvents.shipmentId], references: [shipments.id] }),
}));
export const paymentsRelations = relations(payments, ({ one, many }) => ({
  order: one(orders, { fields: [payments.orderId], references: [orders.id] }), transactions: many(paymentTransactions),
}));
export const paymentTransactionsRelations = relations(paymentTransactions, ({ one }) => ({
  payment: one(payments, { fields: [paymentTransactions.paymentId], references: [payments.id] }),
}));
export const reviewsRelations = relations(reviews, ({ one, many }) => ({
  product: one(products, { fields: [reviews.productId], references: [products.id] }),
  user: one(users, { fields: [reviews.userId], references: [users.id] }),
  images: many(reviewImages),
  response: one(reviewResponses, { fields: [reviews.id], references: [reviewResponses.reviewId] }),
}));
export const reviewImagesRelations = relations(reviewImages, ({ one }) => ({
  review: one(reviews, { fields: [reviewImages.reviewId], references: [reviews.id] }),
}));
export const reviewResponsesRelations = relations(reviewResponses, ({ one }) => ({
  review: one(reviews, { fields: [reviewResponses.reviewId], references: [reviews.id] }),
}));
