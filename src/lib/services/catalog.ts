import 'server-only';
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, ne, or, sql, type SQL } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';
import { db, schema } from '@/lib/db';
import { CATALOG, CATALOG_LIFE } from '@/lib/cache';
import { LIMITS } from '@/lib/config';

const { products: p, stores: s, productImages, productVariants, categories, reviews, storeFollowers } = schema;

/** Precio efectivo (oferta si existe). */
export const effectivePrice = sql<number>`coalesce(${p.salePrice}, ${p.price})`;
const stockSum = sql<number>`(select coalesce(sum(${productVariants.stock}), 0)::int from ${productVariants} where ${productVariants.productId} = "products"."id")`;
const firstImage = sql<string | null>`(select coalesce(${productImages.thumbUrl}, ${productImages.url}) from ${productImages} where ${productImages.productId} = "products"."id" order by ${productImages.position} limit 1)`;
const defaultVariant = sql<string | null>`(select ${productVariants.id}::text from ${productVariants} where ${productVariants.productId} = "products"."id" and (select count(*) from ${productVariants} v2 where v2.product_id = "products"."id") = 1 limit 1)`;

// Productos activos en la categoría o en sus subcategorías.
const categoryCount = sql<number>`(select count(*)::int from products pr join categories c2 on c2.id = pr.category_id
  where pr.status = 'active' and (c2.id = categories.id or c2.parent_id = categories.id))`; // "categories" = consulta externa

/** Solo productos activos de tiendas activas son públicos. */
export const isPublic = and(eq(p.status, 'active'), eq(s.status, 'active'));

const cardFields = {
  id: p.id, slug: p.slug, title: p.title, price: p.price, salePrice: p.salePrice, condition: p.condition,
  ratingAvg: p.ratingAvg, ratingCount: p.ratingCount, salesCount: p.salesCount, isDemo: p.isDemo,
  stock: stockSum, image: firstImage, singleVariantId: defaultVariant,
  storeName: s.name, storeSlug: s.slug,
};
export type ProductCard = {
  id: string; slug: string; title: string; price: number; salePrice: number | null; condition: 'new' | 'used' | 'refurbished';
  ratingAvg: number; ratingCount: number; salesCount: number; isDemo: boolean; stock: number; image: string | null;
  singleVariantId: string | null; storeName: string; storeSlug: string;
};

function cards(where: SQL | undefined, order: SQL[], limit: number, offset = 0) {
  return db.select(cardFields).from(p).innerJoin(s, eq(s.id, p.storeId)).where(and(isPublic, where))
    .orderBy(...order).limit(limit).offset(offset) as unknown as Promise<ProductCard[]>;
}

export async function getHomeSections() {
  'use cache';
  cacheLife(CATALOG_LIFE);
  cacheTag(CATALOG);
  const [bestSellers, newest, offers, topRated, featured, featuredStores, popularCategories] = await Promise.all([
    cards(undefined, [desc(p.salesCount), desc(p.ratingAvg)], 10),
    cards(undefined, [desc(p.publishedAt)], 10),
    cards(isNotNull(p.salePrice), [desc(sql`(${p.price} - ${p.salePrice})::float / ${p.price}`)], 10),
    cards(gte(p.ratingCount, 1), [desc(p.ratingAvg), desc(p.ratingCount)], 10),
    // Destacados: buena calificación ponderada por volumen de ventas.
    cards(undefined, [desc(sql`${p.ratingAvg} * ln(2 + ${p.salesCount})`), desc(p.publishedAt)], 10),
    db.select({
      id: s.id, slug: s.slug, name: s.name, logoUrl: s.logoUrl, bannerUrl: s.bannerUrl, city: s.city, state: s.state,
      ratingAvg: s.ratingAvg, ratingCount: s.ratingCount, salesCount: s.salesCount,
      productCount: sql<number>`(select count(*)::int from products pr where pr.store_id = stores.id and pr.status = 'active')`,
    }).from(s).where(eq(s.status, 'active')).orderBy(desc(s.salesCount), desc(s.ratingAvg)).limit(6),
    db.select({ id: categories.id, slug: categories.slug, name: categories.name, icon: categories.icon, count: categoryCount })
      .from(categories)
      .where(and(isNull(categories.parentId), eq(categories.active, true)))
      .orderBy(desc(categoryCount), asc(categories.position)).limit(8),
  ]);
  return { bestSellers, newest, offers, topRated, featured, featuredStores, popularCategories };
}

export type SearchParams = {
  q?: string; category?: string; min?: number; max?: number; condition?: string; rating?: number;
  inStock?: boolean; store?: string; sort?: string; page?: number; offers?: boolean;
};

export async function searchProducts(f: SearchParams) {
  'use cache';
  cacheLife(CATALOG_LIFE);
  cacheTag(CATALOG);
  const where: (SQL | undefined)[] = [];
  const q = f.q?.trim().slice(0, 100);
  let rank: SQL | undefined;
  if (q) {
    const tsq = sql`websearch_to_tsquery('spanish', immutable_unaccent(${q}))`;
    const trigram = sql`word_similarity(immutable_unaccent(lower(${q})), immutable_unaccent(lower(${p.title}))) >= 0.45`;
    where.push(or(sql`${p.searchVector} @@ ${tsq}`, trigram)); // trigramas toleran errores de dedo ("audifnos")
    rank = sql`ts_rank(${p.searchVector}, ${tsq}) + word_similarity(immutable_unaccent(lower(${q})), immutable_unaccent(lower(${p.title})))`;
  }
  if (f.category) {
    const [cat] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, f.category)).limit(1);
    if (!cat) return { items: [], total: 0 };
    const ids = (await db.select({ id: categories.id }).from(categories).where(or(eq(categories.id, cat.id), eq(categories.parentId, cat.id)))).map((c) => c.id);
    where.push(inArray(p.categoryId, ids));
  }
  if (f.min != null && Number.isFinite(f.min)) where.push(gte(effectivePrice, f.min));
  if (f.max != null && Number.isFinite(f.max)) where.push(lte(effectivePrice, f.max));
  if (f.condition && ['new', 'used', 'refurbished'].includes(f.condition)) where.push(eq(p.condition, f.condition as 'new'));
  if (f.rating) where.push(gte(p.ratingAvg, f.rating));
  if (f.inStock) where.push(sql`${stockSum} > 0`);
  if (f.store) where.push(eq(s.slug, f.store));
  if (f.offers) where.push(isNotNull(p.salePrice));
  const cond = and(...where);

  const order: SQL[] = {
    'precio-asc': [asc(effectivePrice)],
    'precio-desc': [desc(effectivePrice)],
    nuevos: [desc(p.publishedAt)],
    vendidos: [desc(p.salesCount)],
    calificacion: [desc(p.ratingAvg), desc(p.ratingCount)],
  }[f.sort ?? ''] ?? (rank ? [desc(rank)] : [desc(p.salesCount), desc(p.publishedAt)]);

  const page = Math.max(1, Math.min(f.page ?? 1, 200));
  const [items, [{ total }]] = await Promise.all([
    cards(cond, [sql`(${stockSum} > 0) desc`, ...order], LIMITS.pageSize, (page - 1) * LIMITS.pageSize),
    db.select({ total: sql<number>`count(*)::int` }).from(p).innerJoin(s, eq(s.id, p.storeId)).where(and(isPublic, cond)),
  ]);
  return { items, total };
}

export async function getCategoryTree() {
  'use cache';
  cacheLife(CATALOG_LIFE);
  cacheTag(CATALOG);
  const rows = await db.select().from(categories).where(eq(categories.active, true)).orderBy(asc(categories.position), asc(categories.name));
  return rows.filter((c) => !c.parentId).map((c) => ({ ...c, children: rows.filter((x) => x.parentId === c.id) }));
}

export async function getCategoryBySlug(slug: string) {
  'use cache';
  cacheLife(CATALOG_LIFE);
  cacheTag(CATALOG);
  const [c] = await db.select().from(categories).where(and(eq(categories.slug, slug), eq(categories.active, true))).limit(1);
  if (!c) return null;
  const parent = c.parentId ? (await db.select().from(categories).where(eq(categories.id, c.parentId)).limit(1))[0] ?? null : null;
  const children = await db.select().from(categories).where(eq(categories.parentId, c.id)).orderBy(asc(categories.position));
  return { ...c, parent, children };
}

export async function getProductPage(slug: string) {
  'use cache';
  cacheLife(CATALOG_LIFE);
  cacheTag(CATALOG);
  const product = await db.query.products.findFirst({
    where: eq(p.slug, slug),
    with: {
      store: true,
      category: { with: { parent: true } },
      images: { orderBy: [asc(productImages.position)] },
      variants: { orderBy: [asc(productVariants.position)] },
    },
  });
  if (!product || product.status !== 'active' || product.store.status !== 'active') return null;
  return product;
}

export async function getRelated(productId: string, categoryId: number, storeId: string) {
  'use cache';
  cacheLife(CATALOG_LIFE);
  cacheTag(CATALOG);
  return Promise.all([
    cards(and(eq(p.categoryId, categoryId), ne(p.id, productId)), [desc(p.salesCount)], 8),
    cards(and(eq(p.storeId, storeId), ne(p.id, productId)), [desc(p.salesCount)], 8),
  ]);
}

export async function getReviewSummary(productId: string) {
  'use cache';
  cacheLife(CATALOG_LIFE);
  cacheTag(CATALOG);
  const rows = await db.select({ rating: reviews.rating, n: sql<number>`count(*)::int` }).from(reviews)
    .where(and(eq(reviews.productId, productId), eq(reviews.status, 'published'))).groupBy(reviews.rating);
  const dist = [5, 4, 3, 2, 1].map((r) => ({ rating: r, count: rows.find((x) => x.rating === r)?.n ?? 0 }));
  const total = dist.reduce((t, d) => t + d.count, 0);
  const avg = total ? dist.reduce((t, d) => t + d.rating * d.count, 0) / total : 0;
  return { dist, total, avg };
}

export async function listReviews(productId: string, opts: { sort?: 'helpful' | 'recent'; page?: number; rating?: number }) {
  'use cache';
  cacheLife(CATALOG_LIFE);
  cacheTag(CATALOG);
  const page = Math.max(1, opts.page ?? 1);
  return db.query.reviews.findMany({
    where: and(eq(reviews.productId, productId), eq(reviews.status, 'published'), opts.rating ? eq(reviews.rating, opts.rating) : undefined),
    orderBy: opts.sort === 'recent' ? [desc(reviews.createdAt)] : [desc(reviews.helpfulCount), desc(reviews.createdAt)],
    limit: 10, offset: (page - 1) * 10,
    with: { user: { columns: { name: true } }, images: true, response: true },
  });
}

export async function getStorePage(slug: string) {
  'use cache';
  cacheLife(CATALOG_LIFE);
  cacheTag(CATALOG);
  const [store] = await db.select().from(s).where(eq(s.slug, slug)).limit(1);
  if (!store || store.status !== 'active') return null;
  const [[{ products: productCount }], [{ followers }]] = await Promise.all([
    db.select({ products: sql<number>`count(*)::int` }).from(p).where(and(eq(p.storeId, store.id), eq(p.status, 'active'))),
    db.select({ followers: sql<number>`count(*)::int` }).from(storeFollowers).where(eq(storeFollowers.storeId, store.id)),
  ]);
  // Tiempo de respuesta: promedio de horas entre una reseña y la respuesta del vendedor.
  const [resp] = await db.select({ hours: sql<number | null>`avg(extract(epoch from (${schema.reviewResponses.createdAt} - ${reviews.createdAt})) / 3600)` })
    .from(schema.reviewResponses).innerJoin(reviews, eq(reviews.id, schema.reviewResponses.reviewId)).where(eq(schema.reviewResponses.storeId, store.id));
  return { ...store, productCount, followers, responseHours: resp?.hours != null ? Number(resp.hours) : null };
}

export async function listStoreReviews(storeId: string) {
  'use cache';
  cacheLife(CATALOG_LIFE);
  cacheTag(CATALOG);
  return db.query.reviews.findMany({
    where: and(eq(reviews.storeId, storeId), eq(reviews.status, 'published')),
    orderBy: [desc(reviews.createdAt)], limit: 6,
    with: { user: { columns: { name: true } }, product: { columns: { title: true, slug: true } }, response: true },
  });
}

export async function getProductsByIds(ids: string[]) {
  'use cache';
  cacheLife(CATALOG_LIFE);
  cacheTag(CATALOG);
  if (!ids.length) return [];
  return cards(inArray(p.id, ids), [desc(p.publishedAt)], ids.length);
}

export async function allPublicProductSlugs() {
  return db.select({ slug: p.slug, updatedAt: p.updatedAt }).from(p).innerJoin(s, eq(s.id, p.storeId)).where(isPublic).limit(45000);
}
export async function allPublicStoreSlugs() {
  return db.select({ slug: s.slug, updatedAt: s.updatedAt }).from(s).where(eq(s.status, 'active'));
}
