'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { Home, LayoutGrid, Search, ShoppingBag, User, X, ChevronRight } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';

type Cat = { slug: string; name: string; children: { slug: string; name: string }[] };

/**
 * Barra inferior para celular (oculta en pantallas medianas en adelante) y hoja de categorías.
 * El ítem activo no se resalta para no depender de la URL (evita bloquear el render con usePathname).
 */
export function MobileTabBar({ cartCount, signedIn, categories }: { cartCount: number; signedIn: boolean; categories: Cat[] }) {
  const sheet = useRef<HTMLDialogElement>(null);
  const item = 'flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-ink-2 active:text-ink [&_svg]:size-[22px]';
  const focusSearch = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const input = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="q"]')).find((el) => el.offsetParent !== null);
    input?.focus();
  };
  return (
    <>
      <nav aria-label="Navegación principal" className="fixed inset-x-0 bottom-0 z-40 flex h-[calc(60px+env(safe-area-inset-bottom))] border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        <Link href="/" className={item}><Home />Inicio</Link>
        <button type="button" onClick={() => sheet.current?.showModal()} className={item}><LayoutGrid />Categorías</button>
        <button type="button" onClick={focusSearch} className={item}><Search />Buscar</button>
        <Link href="/carrito" className={item} aria-label={`Carrito, ${cartCount} artículos`}>
          <span className="relative">
            <ShoppingBag />
            {cartCount > 0 && <span className="absolute -top-1.5 -right-2.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand px-1 text-[10px] font-semibold text-white ring-2 ring-surface">{cartCount > 99 ? '99+' : cartCount}</span>}
          </span>
          Carrito
        </Link>
        <Link href={signedIn ? '/cuenta' : '/entrar'} className={item}><User />{signedIn ? 'Cuenta' : 'Entrar'}</Link>
      </nav>

      <dialog
        ref={sheet}
        aria-label="Categorías"
        onClick={(e) => { if (e.target === sheet.current) sheet.current?.close(); }}
        className="fixed inset-x-0 top-auto bottom-0 m-0 max-h-[85dvh] w-full max-w-none rounded-t-2xl bg-surface p-0 text-ink shadow-pop backdrop:bg-black/40 open:animate-[sheet-in_.25s_cubic-bezier(.2,.8,.2,1)] md:hidden"
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-line bg-surface px-5 py-4">
          <h2 className="font-semibold">Categorías</h2>
          <button onClick={() => sheet.current?.close()} className="grid size-9 place-items-center rounded-full hover:bg-subtle" aria-label="Cerrar"><X className="size-4" /></button>
        </div>
        <ul className="divide-y divide-line px-2 pb-[calc(16px+env(safe-area-inset-bottom))]">
          {categories.map((c) => (
            <li key={c.slug} className="py-2">
              <Link href={`/categoria/${c.slug}`} onClick={() => sheet.current?.close()} className="flex items-center justify-between rounded-lg px-3 py-2 font-medium hover:bg-subtle">
                {c.name}<ChevronRight className="size-4 text-faint" />
              </Link>
              <div className="flex flex-wrap gap-1.5 px-3 pb-1">
                {c.children.map((k) => (
                  <Link key={k.slug} href={`/categoria/${k.slug}`} onClick={() => sheet.current?.close()} className="rounded-full bg-subtle px-3 py-1 text-[13px] text-ink-2 hover:text-ink">{k.name}</Link>
                ))}
              </div>
            </li>
          ))}
          <li className="flex gap-2 py-3">
            <Link href="/ofertas" onClick={() => sheet.current?.close()} className="flex-1 rounded-lg bg-brand-soft px-3 py-2.5 text-center text-sm font-medium text-brand">Ofertas</Link>
            <Link href="/buscar?sort=nuevos" onClick={() => sheet.current?.close()} className="flex-1 rounded-lg bg-subtle px-3 py-2.5 text-center text-sm font-medium">Novedades</Link>
          </li>
          <li className="flex items-center justify-between px-3 py-3 text-sm text-muted">Apariencia <ThemeToggle withLabel /></li>
        </ul>
      </dialog>
    </>
  );
}
