'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';

type Suggestion = { type: 'product' | 'category'; label: string; href: string };

/**
 * Búsqueda con sugerencias en vivo (productos y categorías). Navegable con teclado;
 * sin JavaScript sigue funcionando como formulario GET a /buscar.
 */
export function SearchBox({ className, defaultValue = '' }: { className?: string; defaultValue?: string }) {
  const [q, setQ] = useState(defaultValue);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const router = useRouter();
  const listId = useId();
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const t = setTimeout(async () => {
      abort.current?.abort();
      abort.current = new AbortController();
      try {
        const res = await fetch(`/api/sugerencias?q=${encodeURIComponent(term)}`, { signal: abort.current.signal });
        if (res.ok) { setItems(await res.json()); setActive(-1); }
      } catch { /* petición cancelada por una nueva búsqueda */ }
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  const visible = q.trim().length >= 2 ? items : [];
  const go = (href: string) => { setOpen(false); router.push(href); };

  return (
    <form
      action="/buscar"
      role="search"
      className={cn('relative', className)}
      onSubmit={(e) => {
        if (active >= 0 && visible[active]) { e.preventDefault(); go(visible[active].href); }
      }}
    >
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
      <input
        name="q"
        type="search"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, visible.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, -1)); }
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder="Buscar productos, marcas y tiendas"
        aria-label="Buscar"
        role="combobox"
        aria-expanded={open && visible.length > 0}
        aria-controls={listId}
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        maxLength={100}
        className="h-10 w-full rounded-full border border-line bg-subtle pr-24 pl-10 text-sm transition-[background-color,border-color,box-shadow] placeholder:text-muted hover:border-line-strong focus:border-ink focus:bg-surface focus:ring-4 focus:ring-ink/5 focus:outline-none"
      />
      <button type="submit" className="absolute top-1 right-1 h-8 rounded-full bg-ink px-4 text-[13px] font-medium text-on-ink transition-colors hover:bg-ink-2">Buscar</button>
      {open && visible.length > 0 && (
        <ul id={listId} role="listbox" className="absolute top-12 right-0 left-0 z-50 overflow-hidden rounded-xl bg-surface py-1.5 shadow-pop animate-pop">
          {visible.map((it, i) => (
            <li key={it.href} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); go(it.href); }}
                className={cn('flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm', i === active ? 'bg-subtle' : 'hover:bg-subtle')}
              >
                {it.type === 'category' ? <Tag className="size-3.5 text-muted" /> : <Search className="size-3.5 text-muted" />}
                <span className="truncate">{it.label}</span>
                {it.type === 'category' && <span className="ml-auto text-xs text-muted">Categoría</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
