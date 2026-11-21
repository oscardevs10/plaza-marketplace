import 'server-only';
import { revalidateTag } from 'next/cache';

/**
 * Caché del catálogo público (productos, categorías, tiendas, reseñas).
 * Las lecturas públicas se guardan con 'use cache' + cacheTag(CATALOG) y se renuevan solas cada minuto;
 * cualquier cambio que afecte lo que ve un comprador (precio, existencias, publicación, reseñas, moderación)
 * llama a invalidateCatalog() para que la siguiente visita vea datos frescos.
 */
export const CATALOG = 'catalog';
export const CATALOG_LIFE = { stale: 60, revalidate: 60, expire: 3600 } as const;

export function invalidateCatalog() {
  try {
    revalidateTag(CATALOG, { expire: 0 });
  } catch {
    // Fuera de una petición (scripts, pruebas) no hay caché que invalidar.
  }
}
