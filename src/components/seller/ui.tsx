import Link from 'next/link';
import type { ReactNode } from 'react';
import { ImageIcon } from 'lucide-react';
import { Badge, Skeleton } from '@/components/ui/misc';
import { cn } from '@/lib/utils';
import { ORDER_STATUS, PRODUCT_STATUS } from './constants';

export type SP = Promise<Record<string, string | string[] | undefined>>;
/** Primer valor de un parámetro GET. */
export const param = (sp: Record<string, string | string[] | undefined>, k: string) => {
  const v = sp[k];
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? '';
};
export const pageParam = (sp: Record<string, string | string[] | undefined>) => Math.max(1, Math.min(500, Number.parseInt(param(sp, 'pagina')) || 1));
/** Construye una URL conservando solo los filtros con valor. */
export const withQuery = (path: string, q: Record<string, string | number | undefined>) => {
  const s = new URLSearchParams(Object.entries(q).filter(([k, v]) => v !== undefined && v !== '' && !(k === 'pagina' && v === 1)).map(([k, v]) => [k, String(v)])).toString();
  return s ? `${path}?${s}` : path;
};

export function OrderStatusBadge({ status }: { status: string }) {
  const s = ORDER_STATUS[status] ?? { label: status, tone: 'neutral' as const };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function ProductStatusBadge({ status }: { status: string }) {
  const s = PRODUCT_STATUS[status] ?? { label: status, tone: 'neutral' as const };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function Thumb({ src, size = 40, className }: { src: string | null; size?: number; className?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- imágenes ya optimizadas al subirlas (WebP)
    <img src={src} alt="" width={size} height={size} loading="lazy" className={cn('shrink-0 rounded-lg bg-subtle object-cover', className)} style={{ width: size, height: size }} />
  ) : (
    <span className={cn('grid shrink-0 place-items-center rounded-lg bg-subtle text-faint', className)} style={{ width: size, height: size }}><ImageIcon className="size-4" /></span>
  );
}

/** Pestañas de filtro como enlaces (GET, funcionan sin JS). */
export function FilterTabs({ items }: { items: { label: string; href: string; active: boolean; count?: number }[] }) {
  return (
    <nav className="scrollbar-none -mx-1 mb-4 flex gap-1 overflow-x-auto px-1" aria-label="Filtros">
      {items.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.active ? 'page' : undefined}
          className={cn('flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors', t.active ? 'bg-ink text-on-ink' : 'text-muted hover:bg-subtle hover:text-ink')}>
          {t.label}
          {t.count != null && <span className={cn('tabular-nums text-xs', t.active ? 'text-on-ink/70' : 'text-faint')}>{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

export const th = 'px-4 py-2.5 text-left text-xs font-medium text-muted whitespace-nowrap';
export const td = 'px-4 py-3 align-middle';

export function Card({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('card p-5', className)}>
      {(title || action) && <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-sm font-semibold">{title}</h2>{action}</div>}
      {children}
    </section>
  );
}

// ---------- Esqueletos para loading.tsx ----------
function HeaderSkeleton() {
  return <div className="mb-6 space-y-2"><Skeleton className="h-7 w-48" /><Skeleton className="h-4 w-72" /></div>;
}

export function TablePageSkeleton() {
  return (
    <div aria-busy aria-label="Cargando">
      <HeaderSkeleton />
      <div className="mb-4 flex gap-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-24" />)}</div>
      <div className="card divide-y divide-line">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3"><Skeleton className="size-10" /><Skeleton className="h-4 flex-1" /><Skeleton className="h-4 w-20" /><Skeleton className="h-4 w-16" /></div>
        ))}
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div aria-busy aria-label="Cargando">
      <HeaderSkeleton />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-[104px] rounded-xl" />)}</div>
      <div className="mt-6 grid gap-4 lg:grid-cols-3"><Skeleton className="h-72 rounded-xl lg:col-span-2" /><Skeleton className="h-72 rounded-xl" /></div>
    </div>
  );
}

export function FormPageSkeleton() {
  return (
    <div aria-busy aria-label="Cargando">
      <HeaderSkeleton />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card space-y-4 p-5 lg:col-span-2">{Array.from({ length: 6 }, (_, i) => <div key={i} className="space-y-2"><Skeleton className="h-3 w-24" /><Skeleton className="h-10 w-full" /></div>)}</div>
        <div className="card space-y-4 p-5">{Array.from({ length: 3 }, (_, i) => <div key={i} className="space-y-2"><Skeleton className="h-3 w-24" /><Skeleton className="h-10 w-full" /></div>)}</div>
      </div>
    </div>
  );
}
