import type { ReactNode } from 'react';
import Link from 'next/link';
import { Star, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn, discountPercent, formatMoney } from '@/lib/utils';

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'dark' | 'sale';
const tones: Record<Tone, string> = {
  sale: 'bg-brand text-white ring-brand',
  neutral: 'bg-subtle text-ink-2 ring-line',
  brand: 'bg-brand-soft text-brand-strong ring-brand/15',
  success: 'bg-success-soft text-success ring-success/15',
  warning: 'bg-warning-soft text-warning ring-warning/15',
  danger: 'bg-danger-soft text-danger ring-danger/15',
  info: 'bg-info-soft text-info ring-info/15',
  dark: 'bg-ink text-on-ink ring-ink',
};
export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset whitespace-nowrap', tones[tone], className)}>{children}</span>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden />;
}

/** Estrellas de calificación (lectura). Soporta medias estrellas por recorte. */
export function Stars({ value, size = 14, className }: { value: number; size?: number; className?: string }) {
  return (
    <span className={cn('relative inline-flex', className)} role="img" aria-label={`${value.toFixed(1)} de 5 estrellas`}>
      <span className="flex text-line-strong">{[0, 1, 2, 3, 4].map((i) => <Star key={i} width={size} height={size} fill="currentColor" strokeWidth={0} />)}</span>
      <span className="absolute inset-0 flex overflow-hidden text-star" style={{ width: `${(Math.max(0, Math.min(5, value)) / 5) * 100}%` }}>
        {[0, 1, 2, 3, 4].map((i) => <Star key={i} width={size} height={size} className="shrink-0" fill="currentColor" strokeWidth={0} />)}
      </span>
    </span>
  );
}

export function Price({ price, salePrice, size = 'md', className }: { price: number; salePrice?: number | null; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const off = discountPercent(price, salePrice);
  const current = off ? salePrice! : price;
  return (
    <div className={cn('flex flex-wrap items-baseline gap-x-2 gap-y-0.5', className)}>
      <span className={cn('font-semibold tabular-nums tracking-tight text-ink', size === 'lg' ? 'text-3xl' : size === 'md' ? 'text-[17px]' : 'text-sm')}>{formatMoney(current)}</span>
      {off > 0 && (
        <>
          <s className={cn('tabular-nums text-muted', size === 'lg' ? 'text-base' : 'text-xs')}>{formatMoney(price)}</s>
          <span className={cn('font-semibold text-brand', size === 'lg' ? 'text-base' : 'text-xs')}>{off}% OFF</span>
        </>
      )}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
      {icon && <div className="mb-4 grid size-12 place-items-center rounded-full bg-subtle text-muted">{icon}</div>}
      <h3 className="text-base font-semibold">{title}</h3>
      {children && <div className="mt-1 max-w-sm text-sm text-muted">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Paginación por enlaces (funciona sin JS y es indexable). `href(page)` construye la URL de cada página. */
export function Pagination({ page, total, pageSize, href }: { page: number; total: number; pageSize: number; href: (page: number) => string }) {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;
  const nums = [...new Set([1, page - 1, page, page + 1, pages].filter((n) => n >= 1 && n <= pages))].sort((a, b) => a - b);
  const item = 'grid h-9 min-w-9 place-items-center rounded-lg px-2 text-sm tabular-nums transition-colors';
  return (
    <nav aria-label="Paginación" className="mt-10 flex items-center justify-center gap-1">
      {page > 1 ? <Link href={href(page - 1)} className={cn(item, 'hover:bg-subtle')} aria-label="Anterior"><ChevronLeft className="size-4" /></Link> : <span className={cn(item, 'text-faint')}><ChevronLeft className="size-4" /></span>}
      {nums.map((n, i) => (
        <span key={n} className="flex items-center gap-1">
          {i > 0 && n - nums[i - 1] > 1 && <span className="px-1 text-faint">…</span>}
          <Link href={href(n)} aria-current={n === page ? 'page' : undefined} className={cn(item, n === page ? 'bg-ink font-medium text-on-ink' : 'hover:bg-subtle')}>{n}</Link>
        </span>
      ))}
      {page < pages ? <Link href={href(page + 1)} className={cn(item, 'hover:bg-subtle')} aria-label="Siguiente"><ChevronRight className="size-4" /></Link> : <span className={cn(item, 'text-faint')}><ChevronRight className="size-4" /></span>}
    </nav>
  );
}

export function PageHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-6 flex flex-wrap items-end justify-between gap-4', className)}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Tarjeta de métrica para tableros. */
export function Stat({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between text-[13px] font-medium text-muted">{label}{icon && <span className="text-faint">{icon}</span>}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export const DemoBadge = () => <Badge tone="info" className="uppercase tracking-wide">Demo</Badge>;
