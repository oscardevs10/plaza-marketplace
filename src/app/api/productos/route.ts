import { getProductsByIds } from '@/lib/services/catalog';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Tarjetas de productos públicos por id (para "Vistos recientemente"). Respeta el orden pedido. */
export async function GET(req: Request) {
  const ids = (new URL(req.url).searchParams.get('ids') ?? '').split(',').filter((id) => UUID.test(id)).slice(0, 12);
  if (!ids.length) return Response.json([]);
  const items = await getProductsByIds(ids);
  const byId = new Map(items.map((p) => [p.id, p]));
  return Response.json(ids.map((id) => byId.get(id)).filter(Boolean), { headers: { 'Cache-Control': 'public, max-age=60' } });
}
