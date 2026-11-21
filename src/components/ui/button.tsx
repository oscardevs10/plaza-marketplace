import Link from 'next/link';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'brand' | 'danger' | 'link';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const variants: Record<Variant, string> = {
  primary: 'bg-ink text-on-ink hover:bg-ink-2 shadow-sm',
  secondary: 'bg-surface text-ink border border-line hover:border-line-strong hover:bg-subtle shadow-sm',
  ghost: 'text-ink-2 hover:bg-subtle hover:text-ink',
  brand: 'bg-brand text-white hover:bg-brand-strong shadow-sm',
  danger: 'bg-surface text-danger border border-line hover:bg-danger-soft hover:border-danger/30',
  link: 'text-ink underline underline-offset-4 decoration-line-strong hover:decoration-ink px-0 h-auto',
};
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] rounded-lg gap-1.5',
  md: 'h-10 px-4 text-sm rounded-[10px] gap-2',
  lg: 'h-12 px-6 text-[15px] rounded-xl gap-2',
  icon: 'size-10 rounded-[10px]',
};

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', className?: string) {
  return cn(
    'inline-flex items-center justify-center font-medium whitespace-nowrap transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.98] select-none',
    'disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
    variants[variant], sizes[size], className,
  );
}

export function Button({ variant, size, className, type = 'button', ...props }: ComponentProps<'button'> & { variant?: Variant; size?: Size }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({ variant, size, className, ...props }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}
