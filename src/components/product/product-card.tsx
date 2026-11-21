import Link from 'next/link';
import type { ProductCard as Card } from '@/lib/services/catalog';
import { Price, Stars, Badge, DemoBadge } from '@/components/ui/misc';
import { discountPercent, cn } from '@/lib/utils';
import { QuickAdd } from './add-to-cart-button';
import { FavoriteHeart } from '@/components/community/favorites';

const CONDITION: Record<string, string> = { used: 'Usado', refurbished: 'Reacondicionado' };

export function ProductCard({ p, priority }: { p: Card; priority?: boolean }) {
  const off = discountPercent(p.price, p.salePrice);
  const out = p.stock <= 0;
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-xl bg-surface shadow-card transition-shadow duration-200 hover:shadow-lift">
      <Link href={`/producto/${p.slug}`} className="relative block aspect-square overflow-hidden bg-subtle" tabIndex={-1} aria-hidden>
        {p.image && (
          // eslint-disable-next-line @next/next/no-img-element -- imágenes ya optimizadas al subirlas (WebP, 480 px)
          <img
            src={p.image}
            alt=""
            width={480}
            height={480}
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : undefined}
            decoding="async"
            className={cn('size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]', out && 'opacity-60 grayscale')}
          />
        )}
        <div className="absolute top-2.5 left-2.5 flex flex-col items-start gap-1">
          {off > 0 && !out && <Badge tone="sale">−{off}%</Badge>}
          {out && <Badge tone="dark">Agotado</Badge>}
          {CONDITION[p.condition] && <Badge>{CONDITION[p.condition]}</Badge>}
        </div>
        {p.isDemo && <div className="absolute bottom-2.5 left-2.5"><DemoBadge /></div>}
      </Link>
      <FavoriteHeart productId={p.id} className="absolute top-2.5 right-2.5 z-10" />
      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        <Link href={`/tienda/${p.storeSlug}`} className="w-fit text-xs text-muted hover:text-ink">{p.storeName}</Link>
        <h3 className="line-clamp-2 min-h-[2.5em] text-sm leading-[1.25] font-medium">
          <Link href={`/producto/${p.slug}`} className="after:absolute after:inset-0 after:content-[''] hover:underline">{p.title}</Link>
        </h3>
        <div className="flex h-4 items-center gap-1.5 text-xs text-muted">
          {p.ratingCount > 0 ? (<><Stars value={Number(p.ratingAvg)} size={12} /><span className="tabular-nums">{Number(p.ratingAvg).toFixed(1)}</span><span>({p.ratingCount})</span></>) : <span>Sin reseñas aún</span>}
        </div>
        <Price price={p.price} salePrice={p.salePrice} className="mt-auto pt-1" />
        <div className={cn('text-xs', out ? 'text-danger' : p.stock <= 5 ? 'text-warning' : 'text-success')}>
          {out ? 'Sin existencias' : p.stock <= 5 ? `Últimas ${p.stock} piezas` : 'Disponible'}
        </div>
        <div className="relative z-10 mt-1.5">
          <QuickAdd variantId={p.singleVariantId} slug={p.slug} disabled={out} />
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ items, priorityCount = 0, className }: { items: Card[]; priorityCount?: number; className?: string }) {
  return (
    <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5', className)}>
      {items.map((p, i) => <ProductCard key={p.id} p={p} priority={i < priorityCount} />)}
    </div>
  );
}

export function ProductGridSkeleton({ count = 10, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5', className)} aria-busy aria-label="Cargando productos">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-xl bg-surface shadow-card">
          <div className="skeleton aspect-square rounded-none" />
          <div className="space-y-2 p-3.5"><div className="skeleton h-3 w-1/3" /><div className="skeleton h-4 w-5/6" /><div className="skeleton h-3 w-1/2" /><div className="skeleton h-5 w-1/3" /><div className="skeleton h-8 w-full" /></div>
        </div>
      ))}
    </div>
  );
}
