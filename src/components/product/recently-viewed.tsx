'use client';

import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import type { ProductCard } from '@/lib/services/catalog';
import { ProductGrid } from './product-card';

const KEY = 'recently-viewed';
const read = (): string[] => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; }
};

/** Registra la visita a un producto (solo en este navegador, máximo 12). */
export function RecordView({ productId }: { productId: string }) {
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify([productId, ...read().filter((id) => id !== productId)].slice(0, 12))); } catch { /* almacenamiento bloqueado */ }
  }, [productId]);
  return null;
}

/** "Vistos recientemente": no aparece si la persona no ha visto productos. */
export function RecentlyViewed({ exclude, title = 'Vistos recientemente' }: { exclude?: string; title?: string }) {
  const [items, setItems] = useState<ProductCard[]>([]);
  useEffect(() => {
    const ids = read().filter((id) => id !== exclude).slice(0, 10);
    if (!ids.length) return;
    fetch(`/api/productos?ids=${ids.join(',')}`).then((r) => r.json()).then(setItems).catch(() => {});
  }, [exclude]);
  if (!items.length) return null;
  return (
    <section className="mt-14 animate-fade-up">
      <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold"><History className="size-4 text-muted" />{title}</h2>
      <ProductGrid items={items.slice(0, 5)} />
    </section>
  );
}
