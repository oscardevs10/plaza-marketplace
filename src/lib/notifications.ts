import 'server-only';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { emailLayout, sendEmail } from '@/lib/email';

export type NotificationType =
  | 'order_placed' | 'new_order' | 'payment_confirmed' | 'order_shipped' | 'order_delivered' | 'order_status'
  | 'new_review' | 'review_response' | 'out_of_stock' | 'new_follower' | 'moderation' | 'new_question' | 'question_answered';

/**
 * Crea una notificación en el centro de notificaciones y, opcionalmente, la envía por correo.
 * Los fallos de correo no rompen la operación que originó el aviso.
 */
export async function notify(userId: string, n: { type: NotificationType; title: string; body?: string; link?: string }, opts: { email?: boolean } = {}) {
  await db.insert(schema.notifications).values({ userId, type: n.type, title: n.title, body: n.body ?? null, link: n.link ?? null });
  if (!opts.email) return;
  try {
    const [u] = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (u) await sendEmail(u.email, n.title, emailLayout({ title: n.title, intro: n.body ?? '', cta: n.link ? { label: 'Ver detalles', href: n.link } : undefined }));
  } catch (e) {
    console.error('notify email failed', e);
  }
}
