import { getCurrentUser } from '@/lib/auth/session';
import { cartCount } from '@/lib/services/cart';
import { getCategoryTree } from '@/lib/services/catalog';
import { MobileTabBar } from './mobile-tab-bar';

/** Datos de la barra inferior de celular (va dentro de un Suspense en el layout). */
export async function MobileNav() {
  const user = await getCurrentUser();
  const [count, tree] = await Promise.all([cartCount(), getCategoryTree()]);
  return <MobileTabBar cartCount={count} signedIn={!!user} categories={tree.map((c) => ({ slug: c.slug, name: c.name, children: c.children.map((k) => ({ slug: k.slug, name: k.name })) }))} />;
}
