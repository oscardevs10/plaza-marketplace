import { getCurrentUser } from '@/lib/auth/session';
import { favoriteIds } from '@/lib/services/community';

/** IDs de favoritos de la persona (para pintar los corazones de las tarjetas). */
export async function GET() {
  const user = await getCurrentUser();
  return Response.json({ signedIn: !!user, ids: user ? await favoriteIds(user.id) : [] }, { headers: { 'Cache-Control': 'private, no-store' } });
}
