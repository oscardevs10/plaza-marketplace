import type { Metadata } from 'next';
import { Heart } from 'lucide-react';
import { requireUser } from '@/lib/auth/guards';
import { favoriteProductIds } from '@/lib/services/account';
import { getProductsByIds } from '@/lib/services/catalog';
import { ProductGrid } from '@/components/product/product-card';
import { EmptyState, PageHeader } from '@/components/ui/misc';
import { ButtonLink } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Favoritos' };

export default async function FavoritesPage() {
  const user = await requireUser('/cuenta/favoritos');
  const ids = await favoriteProductIds(user.id);
  const items = await getProductsByIds(ids); // solo los que siguen publicados
  return (
    <>
      <PageHeader title="Favoritos" description="Productos que guardaste para después." />
      {items.length === 0 ? (
        <EmptyState icon={<Heart className="size-5" />} title="Aún no guardas productos" action={<ButtonLink href="/">Explorar</ButtonLink>}>Toca el corazón en cualquier producto para guardarlo aquí.</EmptyState>
      ) : (
        <ProductGrid items={items} className="xl:grid-cols-4" />
      )}
    </>
  );
}
