'use client';

import { createContext, use, useCallback, useEffect, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Heart } from 'lucide-react';
import { toggleFavoriteAction } from '@/actions/shop';
import { toast } from '@/components/toaster';
import { cn } from '@/lib/utils';

type State = { signedIn: boolean; ids: Set<string> };
type Ctx = State & { toggle: (id: string) => Promise<void> };
const FavoritesContext = createContext<Ctx | null>(null);

async function fetchFavorites(): Promise<State> {
  const d = (await fetch('/api/favoritos', { cache: 'no-store' }).then((r) => r.json())) as { signedIn: boolean; ids: string[] };
  return { signedIn: d.signedIn, ids: new Set(d.ids) };
}

/** Carga una sola vez los favoritos de la persona y los comparte con todas las tarjetas. */
export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ signedIn: false, ids: new Set() });
  const router = useRouter();

  useEffect(() => {
    const load = () => fetchFavorites().then(setState).catch(() => {});
    load();
    window.addEventListener('focus', load); // p. ej. después de iniciar sesión en otra pestaña
    return () => window.removeEventListener('focus', load);
  }, []);

  const toggle = useCallback(async (id: string) => {
    let current = state;
    if (!current.signedIn) current = await fetchFavorites().catch(() => current); // pudo iniciar sesión sin recargar
    if (!current.signedIn) { router.push(`/entrar?next=${encodeURIComponent(location.pathname)}`); return; }
    const was = current.ids.has(id);
    const flip = (s: State, add: boolean) => { const ids = new Set(s.ids); if (add) ids.add(id); else ids.delete(id); return { ...s, ids }; };
    setState(flip(current, !was)); // optimista
    const r = await toggleFavoriteAction(id, null);
    if (r?.error) { toast(r.error, 'error'); setState((s) => flip(s, was)); }
    else toast(was ? 'Quitado de favoritos' : 'Guardado en favoritos');
  }, [state, router]);

  return <FavoritesContext value={{ ...state, toggle }}>{children}</FavoritesContext>;
}

/** Corazón para las tarjetas de producto. */
export function FavoriteHeart({ productId, className }: { productId: string; className?: string }) {
  const ctx = use(FavoritesContext);
  const [pending, start] = useTransition();
  if (!ctx) return null;
  const on = ctx.ids.has(productId);
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); start(() => ctx.toggle(productId)); }}
      disabled={pending}
      aria-pressed={on}
      aria-label={on ? 'Quitar de favoritos' : 'Guardar en favoritos'}
      className={cn('grid size-9 place-items-center rounded-full bg-surface/90 text-ink-2 shadow-card backdrop-blur transition-transform hover:scale-110 active:scale-95', className)}
    >
      <Heart className={cn('size-4 transition-colors', on && 'fill-brand text-brand')} />
    </button>
  );
}
