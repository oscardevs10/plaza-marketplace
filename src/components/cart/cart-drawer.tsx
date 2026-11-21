'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ShoppingBag, X, Loader2, AlertTriangle } from 'lucide-react';
import { buttonClass } from '@/components/ui/button';
import { formatMoney } from '@/lib/utils';

type Cart = {
  signedIn: boolean; count: number; subtotal: number; shipping: number; total: number;
  items: { variantId: string; slug: string; title: string; variant: string; image: string | null; quantity: number; total: number; store: string; problem: string | null }[];
};

/** Abre el panel del carrito desde cualquier componente de cliente. */
export const openCart = () => window.dispatchEvent(new Event('app:cart-open'));

/** Panel lateral del carrito: aparece al agregar un producto, sin salir de la página. */
export function CartDrawer() {
  const ref = useRef<HTMLDialogElement>(null);
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(false);

  const open = useCallback(async () => {
    ref.current?.showModal();
    setLoading(true);
    try {
      const res = await fetch('/api/carrito', { cache: 'no-store' });
      if (res.ok) setCart(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('app:cart-open', open);
    return () => window.removeEventListener('app:cart-open', open);
  }, [open]);

  const close = () => ref.current?.close();

  return (
    <dialog
      ref={ref}
      aria-label="Carrito"
      onClick={(e) => { if (e.target === ref.current) close(); }}
      className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-full max-w-md bg-surface p-0 text-ink shadow-pop backdrop:bg-black/40 backdrop:backdrop-blur-[2px] open:animate-[drawer-in_.25s_cubic-bezier(.2,.8,.2,1)]"
    >
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="flex items-center gap-2 font-semibold"><ShoppingBag className="size-4" />Tu carrito {cart && <span className="text-sm font-normal text-muted">({cart.count})</span>}</h2>
          <button onClick={close} className="grid size-9 place-items-center rounded-full hover:bg-subtle" aria-label="Cerrar carrito"><X className="size-4" /></button>
        </header>
        <div className="flex-1 overflow-y-auto px-5">
          {loading && !cart ? (
            <div className="grid h-40 place-items-center text-muted"><Loader2 className="size-5 animate-spin" /></div>
          ) : !cart?.items.length ? (
            <p className="py-16 text-center text-sm text-muted">Tu carrito está vacío.</p>
          ) : (
            <ul className="divide-y divide-line">
              {cart.items.map((i) => (
                <li key={i.variantId} className="flex gap-3 py-4">
                  <Link href={`/producto/${i.slug}`} onClick={close} className="size-16 shrink-0 overflow-hidden rounded-lg bg-subtle">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {i.image && <img src={i.image} alt="" className="size-full object-cover" />}
                  </Link>
                  <div className="min-w-0 flex-1 text-sm">
                    <Link href={`/producto/${i.slug}`} onClick={close} className="line-clamp-2 font-medium hover:underline">{i.title}</Link>
                    <div className="mt-0.5 text-xs text-muted">{i.variant !== 'Único' && `${i.variant} · `}{i.quantity} pza · {i.store}</div>
                    {i.problem && <div className="mt-1 flex items-center gap-1 text-xs text-danger"><AlertTriangle className="size-3" />{i.problem}</div>}
                  </div>
                  <div className="text-sm font-medium tabular-nums">{formatMoney(i.total)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
        {!!cart?.items.length && (
          <footer className="space-y-3 border-t border-line p-5 pb-[calc(20px+env(safe-area-inset-bottom))]">
            <div className="flex justify-between text-sm"><span className="text-muted">Envío</span><span className="tabular-nums">{cart.shipping ? formatMoney(cart.shipping) : 'Gratis'}</span></div>
            <div className="flex justify-between text-base font-semibold"><span>Total</span><span className="tabular-nums">{formatMoney(cart.total)}</span></div>
            <div className="grid grid-cols-2 gap-2">
              <Link href="/carrito" onClick={close} className={buttonClass('secondary', 'lg')}>Ver carrito</Link>
              <Link href={cart.signedIn ? '/checkout' : '/entrar?next=/checkout'} onClick={close} className={buttonClass('brand', 'lg')}>Pagar</Link>
            </div>
          </footer>
        )}
      </div>
    </dialog>
  );
}
