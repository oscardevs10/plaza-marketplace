'use client';

import { useActionState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Loader2 } from 'lucide-react';
import { addToCartAction } from '@/actions/shop';
import { buttonClass } from '@/components/ui/button';
import { openCart } from '@/components/cart/cart-drawer';
import { toast } from '@/components/toaster';

/** Botón compacto de las tarjetas: agrega y abre el carrito lateral. Si hay varias opciones, lleva a elegirla. */
export function QuickAdd({ variantId, slug, disabled }: { variantId: string | null; slug: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState(addToCartAction, null);
  useEffect(() => {
    if (state?.ok) openCart();
    if (state?.error) toast(state.error, 'error');
  }, [state]);
  if (disabled) return <span className={buttonClass('secondary', 'sm', 'w-full text-muted')} aria-disabled>Agotado</span>;
  if (!variantId) return <Link href={`/producto/${slug}`} className={buttonClass('secondary', 'sm', 'w-full')}>Elegir opción</Link>;
  return (
    <form action={action}>
      <input type="hidden" name="variantId" value={variantId} />
      <input type="hidden" name="quantity" value="1" />
      <button disabled={pending} className={buttonClass('primary', 'sm', 'w-full')}>
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
        Agregar
      </button>
    </form>
  );
}
