import Link from 'next/link';
import { SlidersHorizontal, X, SearchX } from 'lucide-react';
import { searchProducts, getCategoryTree, type SearchParams } from '@/lib/services/catalog';
import { ProductGrid } from '@/components/product/product-card';
import { EmptyState, Pagination, Stars } from '@/components/ui/misc';
import { Input, Select } from '@/components/ui/form';
import { buttonClass } from '@/components/ui/button';
import { LIMITS } from '@/lib/config';
import { cn, formatMoney, parseMoney, pluralize } from '@/lib/utils';

type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

const SORTS: [string, string][] = [['', 'Más relevantes'], ['vendidos', 'Más vendidos'], ['nuevos', 'Más recientes'], ['precio-asc', 'Menor precio'], ['precio-desc', 'Mayor precio'], ['calificacion', 'Mejor calificados']];
const CONDITIONS: [string, string][] = [['', 'Cualquiera'], ['new', 'Nuevo'], ['used', 'Usado'], ['refurbished', 'Reacondicionado']];

/**
 * Listado con búsqueda y filtros. Todo vive en la URL (formulario GET): se puede compartir, guardar e indexar,
 * y funciona sin JavaScript.
 */
export async function CatalogView({ base, raw, category, offersOnly, heading }: {
  base: string; raw: Raw; category?: { slug: string; name: string; children: { slug: string; name: string }[]; parent?: { slug: string; name: string } | null };
  offersOnly?: boolean; heading: string;
}) {
  const q = one(raw.q).slice(0, 100);
  const filters: SearchParams = {
    q, category: category?.slug,
    min: one(raw.min) ? parseMoney(one(raw.min)) : undefined,
    max: one(raw.max) ? parseMoney(one(raw.max)) : undefined,
    condition: one(raw.condicion), rating: Number(one(raw.calificacion)) || undefined,
    inStock: one(raw.disponible) === '1', sort: one(raw.sort), page: Math.max(1, Number(one(raw.page)) || 1), offers: offersOnly,
  };
  const [{ items, total }, tree] = await Promise.all([searchProducts(filters), getCategoryTree()]);

  const params = new URLSearchParams();
  for (const k of ['q', 'min', 'max', 'condicion', 'calificacion', 'disponible', 'sort']) if (one(raw[k])) params.set(k, one(raw[k]));
  const without = (...keys: string[]) => { const p = new URLSearchParams(params); keys.forEach((k) => p.delete(k)); const s = p.toString(); return s ? `${base}?${s}` : base; };
  const pageHref = (n: number) => { const p = new URLSearchParams(params); if (n > 1) p.set('page', String(n)); return `${base}?${p}`; };

  const chips: [string, string[]][] = [];
  if (q) chips.push([`“${q}”`, ['q']]);
  if (filters.min != null || filters.max != null) chips.push([`${filters.min != null ? formatMoney(filters.min) : '$0'} – ${filters.max != null ? formatMoney(filters.max) : 'más'}`, ['min', 'max']]);
  if (filters.condition) chips.push([CONDITIONS.find(([k]) => k === filters.condition)?.[1] ?? '', ['condicion']]);
  if (filters.rating) chips.push([`${filters.rating}★ o más`, ['calificacion']]);
  if (filters.inStock) chips.push(['Disponibles', ['disponible']]);

  const filterForm = (
    <form action={base} className="space-y-6">
      {q && <input type="hidden" name="q" value={q} />}
      {one(raw.sort) && <input type="hidden" name="sort" value={one(raw.sort)} />}
      <FilterGroup title="Categoría">
        <ul className="space-y-1 text-sm">
          {category?.parent && <li><Link href={`/categoria/${category.parent.slug}`} className="text-muted hover:text-ink">← {category.parent.name}</Link></li>}
          {(category ? category.children : tree).map((c) => (
            <li key={c.slug}><Link href={`/categoria/${c.slug}${q ? `?q=${encodeURIComponent(q)}` : ''}`} className="block rounded-md py-1 text-ink-2 hover:text-ink">{c.name}</Link></li>
          ))}
          {category && !category.children.length && <li className="text-muted">Estás en {category.name}</li>}
        </ul>
      </FilterGroup>
      <FilterGroup title="Precio">
        <div className="flex items-center gap-2">
          <Input name="min" inputMode="decimal" placeholder="Mín." defaultValue={one(raw.min)} aria-label="Precio mínimo" className="h-9" />
          <span className="text-muted">–</span>
          <Input name="max" inputMode="decimal" placeholder="Máx." defaultValue={one(raw.max)} aria-label="Precio máximo" className="h-9" />
        </div>
      </FilterGroup>
      <FilterGroup title="Condición">
        <div className="space-y-1.5 text-sm">
          {CONDITIONS.map(([v, l]) => (
            <label key={v} className="flex cursor-pointer items-center gap-2"><input type="radio" name="condicion" value={v} defaultChecked={(filters.condition ?? '') === v} className="accent-ink" />{l}</label>
          ))}
        </div>
      </FilterGroup>
      <FilterGroup title="Calificación">
        <div className="space-y-1.5 text-sm">
          {[0, 4, 3].map((r) => (
            <label key={r} className="flex cursor-pointer items-center gap-2">
              <input type="radio" name="calificacion" value={r || ''} defaultChecked={(filters.rating ?? 0) === r} className="accent-ink" />
              {r ? <span className="flex items-center gap-1.5"><Stars value={r} size={12} /> o más</span> : 'Cualquiera'}
            </label>
          ))}
        </div>
      </FilterGroup>
      <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" name="disponible" value="1" defaultChecked={filters.inStock} className="size-4 accent-ink" />Solo disponibles</label>
      <button className={buttonClass('primary', 'md', 'w-full')}>Aplicar filtros</button>
    </form>
  );

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
      <nav className="mb-3 text-[13px] text-muted" aria-label="Ruta">
        <Link href="/" className="hover:text-ink">Inicio</Link>
        {category?.parent && <> / <Link href={`/categoria/${category.parent.slug}`} className="hover:text-ink">{category.parent.name}</Link></>}
        {' / '}<span className="text-ink-2">{heading}</span>
      </nav>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">{heading}</h1>
          <p className="mt-1 text-sm text-muted">{pluralize(total, 'resultado', 'resultados')}</p>
        </div>
        <form action={base} className="flex items-center gap-2">
          {[...params.entries()].filter(([k]) => k !== 'sort').map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <label htmlFor="sort" className="text-sm text-muted">Ordenar</label>
          <Select id="sort" name="sort" defaultValue={one(raw.sort)} className="h-9 w-48">{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
          <button className={buttonClass('secondary', 'sm', 'h-9')}>Aplicar</button>
        </form>
      </div>

      {chips.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {chips.map(([label, keys]) => (
            <Link key={label} href={without(...keys)} className="inline-flex items-center gap-1 rounded-full bg-surface py-1 pr-2 pl-3 text-[13px] shadow-card hover:bg-subtle">{label}<X className="size-3.5 text-muted" /><span className="sr-only">Quitar filtro</span></Link>
          ))}
          <Link href={base} className="text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline">Limpiar todo</Link>
        </div>
      )}

      <div className="mt-6 grid gap-8 lg:grid-cols-[240px_1fr]">
        <aside>
          <details className="card group p-4 lg:hidden">
            <summary className="flex items-center gap-2 text-sm font-medium"><SlidersHorizontal className="size-4" /> Filtros {chips.length > 0 && <span className="rounded-full bg-ink px-1.5 text-[11px] text-on-ink">{chips.length}</span>}</summary>
            <div className="mt-4">{filterForm}</div>
          </details>
          <div className="sticky top-32 hidden lg:block">{filterForm}</div>
        </aside>
        <section aria-label="Resultados">
          {items.length ? (
            <>
              <ProductGrid items={items} priorityCount={4} className="xl:grid-cols-4" />
              <Pagination page={filters.page!} total={total} pageSize={LIMITS.pageSize} href={pageHref} />
            </>
          ) : (
            <EmptyState icon={<SearchX className="size-5" />} title="No encontramos productos" action={<Link href={base === '/buscar' ? '/buscar' : base} className={buttonClass('secondary')}>Quitar filtros</Link>}>
              {q ? <>Revisa la ortografía o prueba con términos más generales que “{q}”.</> : 'Prueba con otros filtros.'}
            </EmptyState>
          )}
        </section>
      </div>
    </main>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <fieldset><legend className="mb-2.5 text-[13px] font-semibold">{title}</legend>{children}</fieldset>;
}

export function CatalogSkeleton() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
      <div className="skeleton h-4 w-40" />
      <div className="mt-3 skeleton h-8 w-72" />
      <div className="mt-8 grid gap-8 lg:grid-cols-[240px_1fr]">
        <div className="hidden space-y-4 lg:block">{Array.from({ length: 6 }, (_, i) => <div key={i} className={cn('skeleton', i % 2 ? 'h-24' : 'h-6')} />)}</div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton aspect-[3/4.4] rounded-xl" />)}</div>
      </div>
    </div>
  );
}
