import Link from 'next/link';
import { APP_NAME } from '@/lib/config';
import { cn } from '@/lib/utils';

/** Marca: un cuadro con esquina recortada (una "plaza" vista desde arriba) + el nombre. */
export function Logo({ className, href = '/' }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn('flex shrink-0 items-center gap-2 font-semibold tracking-tight', className)} aria-label={`${APP_NAME}, inicio`}>
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="9" fill="var(--color-ink)" />
        <path d="M9 8h9.5a6 6 0 0 1 0 12H14v4H9V8Zm5 4.5v3h4.2a1.5 1.5 0 0 0 0-3H14Z" fill="var(--color-on-ink)" />
        <circle cx="24.5" cy="24.5" r="3" fill="var(--color-brand)" />
      </svg>
      <span className="text-[19px]">{APP_NAME}</span>
    </Link>
  );
}
