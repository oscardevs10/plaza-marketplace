'use client';

import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Minus, Plus, Loader2, ShoppingBag, Zap } from 'lucide-react';
import { addToCartAction, buyNowAction } from '@/actions/shop';
import { buttonClass } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/action-form';
import { cn, discountPercent, formatMoney } from '@/lib/utils';
import { openCart } from '@/components/cart/cart-drawer';

type Variant = { id: string; name: string; stock: number; priceOverride: number | null };

/** Selector de opción + cantidad + agregar/comprar. El servidor vuelve a validar precio y existencias. */
export function PurchasePanel({ variants, price, salePrice, isOwner }: { variants: Variant[]; price: number; salePrice: number | null; isOwner: boolean }) {
  const firstAvailable = variants.find((v) => v.stock > 0) ?? variants[0];
  const [selected, setSelected] = useState(firstAvailable?.id);
  const [qty, setQty] = useState(1);
  const [addState, addAction, adding] = useActionState(addToCartAction, null);
  const [buyState, buyAction, buying] = useActionState(buyNowAction, null);
  const v = variants.find((x) => x.id === selected) ?? firstAvailable;
  const unit = v?.priceOverride ?? salePrice ?? price;
  const list = v?.priceOverride ?? price;
  const off = v?.priceOverride ? 0 : discountPercent(price, salePrice);
  const single = variants.length === 1 && variants[0].name === 'Único';
  const max = Math.min(v?.stock ?? 0, 99);
  // Al agregar: abre el carrito lateral. En celular, barra fija de compra cuando los botones salen de la vista.
  useEffect(() => { if (addState?.ok) openCart(); }, [addState]);
  const buttons = useRef<HTMLDivElement>(null);
  const [showBar, setShowBar] = useState(false);
  useEffect(() => {
    const el = buttons.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setShowBar(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const stockLabel = useMemo(() => (!v || v.stock <= 0 ? 'Agotado' : v.stock <= 5 ? `¡Solo quedan ${v.stock}!` : `${v.stock} disponibles`), [v]);

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[34px] leading-none font-semibold tracking-tight tabular-nums">{formatMoney(unit)}</span>
        {off > 0 && <><s className="text-lg text-muted tabular-nums">{formatMoney(list)}</s><span className="rounded-md bg-brand px-1.5 py-0.5 text-sm font-semibold text-white">{off}% OFF</span></>}
      </div>
      {off > 0 && <p className="mt-1.5 text-sm text-success">Ahorras {formatMoney(list - unit)}</p>}

      {!single && (
        <fieldset className="mt-6">
          <legend className="mb-2 text-sm font-medium">Opción: <span className="text-ink-2">{v?.name}</span></legend>
          <div className="flex flex-wrap gap-2">
            {variants.map((x) => (
              <button
                key={x.id}
                type="button"
                onClick={() => { setSelected(x.id); setQty(1); }}
                disabled={x.stock <= 0}
                aria-pressed={x.id === selected}
                className={cn(
                  'min-w-12 rounded-[10px] border px-3.5 py-2 text-sm font-medium transition-all',
                  x.id === selected ? 'border-ink bg-ink text-on-ink shadow-sm' : 'border-line bg-surface hover:border-line-strong',
                  x.stock <= 0 && 'cursor-not-allowed border-dashed text-faint line-through hover:border-line',
                )}
              >
                {x.name}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <p className={cn('mt-5 text-sm font-medium', !v || v.stock <= 0 ? 'text-danger' : v.stock <= 5 ? 'text-warning' : 'text-success')}>{stockLabel}</p>

      {isOwner ? (
        <div className="mt-4 rounded-xl bg-subtle p-4 text-sm text-ink-2">Este producto es de tu tienda. <Link href="/vendedor/productos" className="link">Administrarlo</Link></div>
      ) : (
        <form className="mt-4 space-y-3">
          <input type="hidden" name="variantId" value={v?.id ?? ''} />
          <input type="hidden" name="quantity" value={qty} />
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted">Cantidad</span>
            <div className="flex items-center rounded-[10px] border border-line bg-surface">
              <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} className="grid size-10 place-items-center text-ink-2 hover:text-ink disabled:opacity-30" disabled={qty <= 1} aria-label="Menos"><Minus className="size-4" /></button>
              <span className="w-8 text-center text-sm font-medium tabular-nums" aria-live="polite">{qty}</span>
              <button type="button" onClick={() => setQty((q) => Math.min(max, q + 1))} className="grid size-10 place-items-center text-ink-2 hover:text-ink disabled:opacity-30" disabled={qty >= max} aria-label="Más"><Plus className="size-4" /></button>
            </div>
          </div>
          <div ref={buttons} className="grid gap-2.5 sm:grid-cols-2">
            <button formAction={buyAction} disabled={!v || v.stock <= 0 || buying || adding} className={buttonClass('brand', 'lg', 'w-full')}>
              {buying ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />} Comprar ahora
            </button>
            <button formAction={addAction} disabled={!v || v.stock <= 0 || buying || adding} className={buttonClass('primary', 'lg', 'w-full')}>
              {adding ? <Loader2 className="size-4 animate-spin" /> : <ShoppingBag className="size-4" />}
              Agregar al carrito
            </button>
          </div>
          <FormMessage state={buyState?.error ? buyState : addState?.error ? addState : null} />
          <div className={cn('fixed inset-x-0 bottom-[calc(60px+env(safe-area-inset-bottom))] z-30 flex items-center gap-3 border-t border-line bg-surface/95 px-4 py-2.5 backdrop-blur-xl transition-transform duration-200 md:hidden', showBar ? 'translate-y-0' : 'pointer-events-none translate-y-[200%]')} aria-hidden={!showBar}>
            <div className="min-w-0 flex-1"><div className="font-semibold tabular-nums">{formatMoney(unit)}</div>{!single && <div className="truncate text-xs text-muted">{v?.name}</div>}</div>
            <button formAction={addAction} disabled={!v || v.stock <= 0 || buying || adding} className={buttonClass('primary', 'md')} tabIndex={showBar ? 0 : -1} aria-label="Agregar al carrito"><ShoppingBag className="size-4" /></button>
            <button formAction={buyAction} disabled={!v || v.stock <= 0 || buying || adding} className={buttonClass('brand', 'md')} tabIndex={showBar ? 0 : -1}>{buying ? <Loader2 className="size-4 animate-spin" /> : null}Comprar</button>
          </div>
        </form>
      )}
    </div>
  );
}
