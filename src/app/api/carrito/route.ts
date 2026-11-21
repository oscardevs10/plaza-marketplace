import { loadCart } from '@/lib/services/cart';
import { getCurrentUser } from '@/lib/auth/session';

/** Resumen del carrito para el panel lateral (solo lectura; los totales finales se recalculan en el checkout). */
export async function GET() {
  const [cart, user] = await Promise.all([loadCart(), getCurrentUser()]);
  return Response.json(
    {
      signedIn: !!user,
      items: cart.groups.flatMap((g) => g.lines.map((l) => ({
        variantId: l.variantId, slug: l.slug, title: l.title, variant: l.variantName, image: l.image,
        quantity: l.quantity, total: l.unitPrice * l.quantity, store: g.store.name, problem: l.problem,
      }))),
      count: cart.totals.items,
      subtotal: cart.totals.subtotal,
      shipping: cart.totals.shipping,
      total: cart.totals.total,
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
