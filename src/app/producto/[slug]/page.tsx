import type { Metadata } from 'next';
import { Suspense, cache } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ShieldCheck, Truck, BadgeCheck, MapPin, Store, PencilLine } from 'lucide-react';
import { getProductPage, getRelated, getReviewSummary, listReviews } from '@/lib/services/catalog';
import { getCurrentUser } from '@/lib/auth/session';
import { isFavorite, isFollowing } from '@/lib/services/community';
import { reviewableItems } from '@/lib/services/reviews';
import { toggleFavoriteAction, toggleFollowAction, reportAction, helpfulAction } from '@/actions/shop';
import { Gallery } from '@/components/product/gallery';
import { PurchasePanel } from '@/components/product/purchase-panel';
import { ProductQuestions } from '@/components/product/questions';
import { RecordView, RecentlyViewed } from '@/components/product/recently-viewed';
import { ProductGrid } from '@/components/product/product-card';
import { FavoriteButton, FollowButton, HelpfulButton, ReportForm } from '@/components/community/toggles';
import { Badge, Stars, Skeleton, DemoBadge } from '@/components/ui/misc';
import { ButtonLink } from '@/components/ui/button';
import { APP_URL } from '@/lib/config';
import { formatDate, formatMoney, pluralize } from '@/lib/utils';

const load = cache(getProductPage);
const CONDITION = { new: 'Nuevo', used: 'Usado', refurbished: 'Reacondicionado' } as const;

export async function generateMetadata(props: PageProps<'/producto/[slug]'>): Promise<Metadata> {
  const p = await load((await props.params).slug);
  if (!p) return { title: 'Producto no encontrado' };
  const description = p.description.slice(0, 155) || `${p.title} en ${p.store.name}`;
  return {
    title: p.title,
    description,
    alternates: { canonical: `/producto/${p.slug}` },
    openGraph: { title: p.title, description, images: p.images[0] ? [{ url: p.images[0].url }] : undefined, type: 'website' },
  };
}

export default async function ProductPage(props: PageProps<'/producto/[slug]'>) {
  const [{ slug }, sp] = await Promise.all([props.params, props.searchParams]);
  const p = await load(slug);
  if (!p) notFound();
  const user = await getCurrentUser();
  const isOwner = user?.id === p.store.ownerId;
  const summary = await getReviewSummary(p.id);
  const price = p.salePrice ?? p.price;
  const stock = p.variants.reduce((t, v) => t + v.stock, 0);

  // Datos estructurados para Google (Product + AggregateRating + Offer).
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'Product', name: p.title, description: p.description, sku: p.sku ?? undefined,
    brand: p.brand ? { '@type': 'Brand', name: p.brand } : undefined, image: p.images.map((i) => (i.url.startsWith('http') ? i.url : APP_URL + i.url)),
    itemCondition: `https://schema.org/${p.condition === 'new' ? 'NewCondition' : p.condition === 'used' ? 'UsedCondition' : 'RefurbishedCondition'}`,
    offers: { '@type': 'Offer', url: `${APP_URL}/producto/${p.slug}`, priceCurrency: 'MXN', price: (price / 100).toFixed(2), availability: stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', seller: { '@type': 'Organization', name: p.store.name } },
    aggregateRating: summary.total ? { '@type': 'AggregateRating', ratingValue: summary.avg.toFixed(1), reviewCount: summary.total } : undefined,
  };

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <nav className="mb-5 text-[13px] text-muted" aria-label="Ruta">
        <Link href="/" className="hover:text-ink">Inicio</Link>
        {p.category.parent && <> / <Link href={`/categoria/${p.category.parent.slug}`} className="hover:text-ink">{p.category.parent.name}</Link></>}
        {' / '}<Link href={`/categoria/${p.category.slug}`} className="hover:text-ink">{p.category.name}</Link>
      </nav>

      {sp.resena === 'publicada' && <div className="mb-5 rounded-xl bg-success-soft px-4 py-3 text-sm text-success">¡Gracias! Tu reseña verificada ya está publicada.</div>}

      <div className="grid gap-8 lg:grid-cols-[1.15fr_1fr] lg:gap-12">
        <Gallery images={p.images} title={p.title} />

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/tienda/${p.store.slug}`} className="text-sm font-medium text-ink-2 hover:text-ink hover:underline">{p.store.name}</Link>
            <Badge>{CONDITION[p.condition]}</Badge>
            {p.isDemo && <DemoBadge />}
          </div>
          <h1 className="mt-2 text-2xl leading-tight font-semibold sm:text-[28px]">{p.title}</h1>
          <a href="#resenas" className="mt-2 inline-flex items-center gap-2 text-sm text-muted hover:text-ink">
            {summary.total ? <><Stars value={summary.avg} /> <span className="font-medium text-ink tabular-nums">{summary.avg.toFixed(1)}</span> · {pluralize(summary.total, 'reseña', 'reseñas')}</> : 'Aún sin reseñas'}
            {p.salesCount > 0 && <span>· {pluralize(p.salesCount, 'vendido', 'vendidos')}</span>}
          </a>

          <div className="mt-6 rounded-2xl border border-line bg-surface p-5 sm:p-6">
            <PurchasePanel variants={p.variants.map((v) => ({ id: v.id, name: v.name, stock: v.stock, priceOverride: v.priceOverride }))} price={p.price} salePrice={p.salePrice} isOwner={isOwner} />
            {!isOwner && (
              <div className="mt-3">
                <Suspense fallback={<Skeleton className="h-12 w-full rounded-xl" />}><Favorite productId={p.id} /></Suspense>
              </div>
            )}
            <ul className="mt-6 space-y-3 border-t border-line pt-5 text-sm">
              <li className="flex gap-3"><Truck className="mt-0.5 size-4 shrink-0 text-muted" /><span>
                Envío {p.store.freeShippingOver != null && price >= p.store.freeShippingOver ? <b className="font-medium text-success">gratis</b> : <b className="font-medium">{formatMoney(p.store.shippingFlat)}</b>}
                {p.store.freeShippingOver != null && price < p.store.freeShippingOver && <span className="text-muted"> · gratis en compras de esta tienda desde {formatMoney(p.store.freeShippingOver)}</span>}
                <span className="block text-muted">Sale en {p.store.processingDays} {p.store.processingDays === 1 ? 'día hábil' : 'días hábiles'}{p.store.city ? ` desde ${p.store.city}` : ''}.</span>
              </span></li>
              <li className="flex gap-3"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted" /><span><b className="font-medium">Compra protegida.</b> <span className="text-muted">Recibe el producto que pediste o te devolvemos tu dinero.</span></span></li>
            </ul>
          </div>

          <StoreCard store={p.store} />
          <div className="mt-4"><ReportForm action={reportAction} targetType="product" targetId={p.id} label="Reportar esta publicación" /></div>
        </div>
      </div>

      <section className="mt-14 grid gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-12">
        <div>
          <h2 className="text-lg font-semibold">Descripción</h2>
          <div className="mt-3 space-y-3 text-[15px] leading-relaxed whitespace-pre-line text-ink-2">{p.description || 'El vendedor no agregó descripción.'}</div>
          {p.shippingInfo && <p className="mt-4 text-sm text-muted">{p.shippingInfo}</p>}
        </div>
        <div>
          <h2 className="text-lg font-semibold">Características</h2>
          <dl className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface text-sm">
            {([
              ['Marca', p.brand], ['Condición', CONDITION[p.condition]], ['SKU', p.sku],
              ['Peso', p.weightGrams ? `${(p.weightGrams / 1000).toLocaleString('es-MX')} kg` : null],
              ['Dimensiones', p.lengthCm && p.widthCm && p.heightCm ? `${p.lengthCm} × ${p.widthCm} × ${p.heightCm} cm` : null],
              ['Categoría', p.category.name],
            ] as [string, string | null][]).filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="grid grid-cols-[140px_1fr] px-4 py-2.5"><dt className="text-muted">{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
        </div>
      </section>

      <Suspense fallback={<div className="skeleton mt-16 h-48 rounded-xl" />}><ProductQuestions productId={p.id} ownerId={p.store.ownerId} slug={p.slug} /></Suspense>

      <Reviews productId={p.id} summary={summary} sort={sp.orden === 'recientes' ? 'recent' : 'helpful'} rating={Number(sp.estrellas) || undefined} />

      <Suspense fallback={null}><Related productId={p.id} categoryId={p.categoryId} storeId={p.storeId} storeName={p.store.name} storeSlug={p.store.slug} /></Suspense>
      <RecordView productId={p.id} />
      <RecentlyViewed exclude={p.id} />
    </main>
  );
}

async function Favorite({ productId }: { productId: string }) {
  const user = await getCurrentUser();
  const fav = user ? await isFavorite(user.id, productId) : false;
  return <FavoriteButton action={toggleFavoriteAction.bind(null, productId)} initial={fav} />;
}

function StoreCard({ store }: { store: NonNullable<Awaited<ReturnType<typeof getProductPage>>>['store'] }) {
  return (
    <div className="mt-4 flex items-center gap-4 rounded-2xl border border-line bg-surface p-4">
      <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-subtle font-semibold">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {store.logoUrl ? <img src={store.logoUrl} alt="" className="size-full object-cover" /> : <Store className="size-5 text-muted" />}
      </div>
      <div className="min-w-0 flex-1">
        <Link href={`/tienda/${store.slug}`} className="font-medium hover:underline">{store.name}</Link>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted">
          {store.ratingCount > 0 && <span className="flex items-center gap-1"><Stars value={Number(store.ratingAvg)} size={11} />{Number(store.ratingAvg).toFixed(1)}</span>}
          <span>{pluralize(store.salesCount, 'venta', 'ventas')}</span>
          {store.city && <span className="flex items-center gap-1"><MapPin className="size-3" />{store.city}</span>}
        </div>
      </div>
      <Suspense fallback={<Skeleton className="h-8 w-28" />}><Follow storeId={store.id} slug={store.slug} ownerId={store.ownerId} /></Suspense>
    </div>
  );
}

async function Follow({ storeId, slug, ownerId }: { storeId: string; slug: string; ownerId: string }) {
  const user = await getCurrentUser();
  if (user?.id === ownerId) return null;
  const following = user ? await isFollowing(user.id, storeId) : false;
  return <FollowButton action={toggleFollowAction.bind(null, storeId, slug)} initial={following} />;
}

async function Reviews({ productId, summary, sort, rating }: { productId: string; summary: Awaited<ReturnType<typeof getReviewSummary>>; sort: 'helpful' | 'recent'; rating?: number }) {
  const reviews = await listReviews(productId, { sort, rating });
  const tab = (label: string, href: string, active: boolean) => <Link href={href} scroll={false} className={active ? 'rounded-md bg-ink px-2.5 py-1 text-on-ink' : 'rounded-md px-2.5 py-1 text-muted hover:bg-subtle hover:text-ink'}>{label}</Link>;
  const q = (o: Record<string, string | undefined>) => `?${new URLSearchParams(Object.entries(o).filter(([, v]) => v) as [string, string][])}#resenas`;
  return (
    <section id="resenas" className="mt-16 scroll-mt-32 border-t border-line pt-10">
      <h2 className="text-xl font-semibold">Opiniones de compradores</h2>
      <div className="mt-6 grid gap-10 lg:grid-cols-[300px_1fr]">
        <div>
          <div className="flex items-end gap-3"><span className="text-5xl font-semibold tracking-tight tabular-nums">{summary.total ? summary.avg.toFixed(1) : '–'}</span><div className="pb-1.5"><Stars value={summary.avg} size={16} /><div className="mt-1 text-xs text-muted">{pluralize(summary.total, 'reseña verificada', 'reseñas verificadas')}</div></div></div>
          <ul className="mt-5 space-y-1.5">
            {summary.dist.map((d) => (
              <li key={d.rating}>
                <Link href={q({ estrellas: rating === d.rating ? undefined : String(d.rating), orden: sort === 'recent' ? 'recientes' : undefined })} scroll={false} className={`grid grid-cols-[28px_1fr_32px] items-center gap-2 rounded-md px-1 py-0.5 text-xs hover:bg-subtle ${rating === d.rating ? 'bg-subtle font-medium' : ''}`}>
                  <span className="tabular-nums text-muted">{d.rating}★</span>
                  <span className="h-2 overflow-hidden rounded-full bg-subtle"><span className="block h-full rounded-full bg-star" style={{ width: `${summary.total ? (d.count / summary.total) * 100 : 0}%` }} /></span>
                  <span className="text-right tabular-nums text-muted">{d.count}</span>
                </Link>
              </li>
            ))}
          </ul>
          <Suspense fallback={null}><WriteReviewCta productId={productId} /></Suspense>
          <p className="mt-5 flex gap-2 text-xs text-muted"><BadgeCheck className="size-4 shrink-0 text-success" />Solo pueden opinar personas que compraron y recibieron este producto en Plaza.</p>
        </div>
        <div>
          {summary.total > 0 && (
            <div className="mb-4 flex gap-1 text-sm">
              {tab('Más útiles', q({ estrellas: rating ? String(rating) : undefined }), sort === 'helpful')}
              {tab('Más recientes', q({ orden: 'recientes', estrellas: rating ? String(rating) : undefined }), sort === 'recent')}
            </div>
          )}
          {reviews.length === 0 && <p className="rounded-xl border border-dashed border-line-strong p-8 text-center text-sm text-muted">{rating ? 'No hay reseñas con esa calificación.' : 'Este producto aún no tiene reseñas. ¡Cómpralo y sé la primera persona en opinar!'}</p>}
          <ul className="divide-y divide-line">
            {reviews.map((r) => (
              <li key={r.id} className="py-6 first:pt-0">
                <div className="flex items-center gap-2"><Stars value={r.rating} /><span className="text-sm font-medium">{r.title}</span></div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span>{r.user.name.split(' ')[0]} {r.user.name.split(' ')[1]?.[0] ? `${r.user.name.split(' ')[1][0]}.` : ''}</span>·<time dateTime={new Date(r.createdAt).toISOString()}>{formatDate(r.createdAt)}</time>
                  {r.verified && <span className="inline-flex items-center gap-1 text-success"><BadgeCheck className="size-3.5" />Compra verificada</span>}
                </div>
                <p className="mt-2.5 text-[15px] leading-relaxed whitespace-pre-line text-ink-2">{r.body}</p>
                {r.images.length > 0 && (
                  <div className="mt-3 flex gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {r.images.map((im) => <a key={im.id} href={im.url} target="_blank" rel="noopener"><img src={im.thumbUrl ?? im.url} alt="Foto del comprador" className="size-20 rounded-lg object-cover" loading="lazy" /></a>)}
                  </div>
                )}
                {r.response && (
                  <div className="mt-3 rounded-xl bg-subtle p-3.5 text-sm"><div className="mb-1 text-xs font-medium">Respuesta de la tienda</div><p className="whitespace-pre-line text-ink-2">{r.response.body}</p></div>
                )}
                <div className="mt-2 flex items-center gap-3">
                  <HelpfulButton action={helpfulAction.bind(null, r.id)} count={r.helpfulCount} />
                  <ReportForm action={reportAction} targetType="review" targetId={r.id} />
                </div>
              </li>
            ))}
          </ul>
          {reviews.length === 10 && <p className="mt-4 text-sm text-muted">Mostrando las 10 reseñas {sort === 'recent' ? 'más recientes' : 'más útiles'}.</p>}
        </div>
      </div>
    </section>
  );
}

async function WriteReviewCta({ productId }: { productId: string }) {
  const user = await getCurrentUser();
  if (!user) return null;
  const items = await reviewableItems(user.id, productId);
  if (!items.length) return null;
  return <ButtonLink href={`/cuenta/resenas/${items[0].orderItemId}`} variant="secondary" className="mt-5 w-full"><PencilLine className="size-4" />Escribir mi reseña</ButtonLink>;
}

async function Related({ productId, categoryId, storeId, storeName, storeSlug }: { productId: string; categoryId: number; storeId: string; storeName: string; storeSlug: string }) {
  const [sameCategory, sameStore] = await getRelated(productId, categoryId, storeId);
  return (
    <>
      {sameStore.length > 0 && (
        <section className="mt-16">
          <div className="mb-4 flex items-end justify-between"><h2 className="text-xl font-semibold">Más de {storeName}</h2><Link href={`/tienda/${storeSlug}`} className="text-sm font-medium text-muted hover:text-ink">Ver tienda →</Link></div>
          <ProductGrid items={sameStore.slice(0, 5)} />
        </section>
      )}
      {sameCategory.length > 0 && (
        <section className="mt-16">
          <h2 className="mb-4 text-xl font-semibold">También te puede interesar</h2>
          <ProductGrid items={sameCategory.slice(0, 5)} />
        </section>
      )}
    </>
  );
}
