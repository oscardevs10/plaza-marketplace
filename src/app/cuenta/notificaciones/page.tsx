import type { Metadata } from 'next';
import Link from 'next/link';
import { Bell, Package, Star, Truck, CreditCard, UserPlus, AlertTriangle, MessageSquare, MessageCircleQuestion } from 'lucide-react';
import { requireUser } from '@/lib/auth/guards';
import { listNotifications } from '@/lib/services/community';
import { markNotificationsReadAction } from '@/actions/account';
import { SubmitButton } from '@/components/ui/action-form';
import { EmptyState, PageHeader } from '@/components/ui/misc';
import { formatDateTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'Notificaciones' };

const ICON: Record<string, typeof Bell> = {
  order_placed: Package, new_order: Package, payment_confirmed: CreditCard, order_shipped: Truck, order_delivered: Package, order_status: Package,
  new_review: Star, review_response: MessageSquare, new_question: MessageCircleQuestion, question_answered: MessageCircleQuestion, out_of_stock: AlertTriangle, new_follower: UserPlus, moderation: AlertTriangle,
};

export default async function NotificationsPage() {
  const user = await requireUser('/cuenta/notificaciones');
  const list = await listNotifications(user.id, 50);
  const unread = list.some((n) => !n.readAt);
  return (
    <>
      <PageHeader title="Notificaciones" actions={unread && <form action={markNotificationsReadAction}><SubmitButton variant="secondary" size="sm">Marcar todo como leído</SubmitButton></form>} />
      {list.length === 0 ? (
        <EmptyState icon={<Bell className="size-5" />} title="Sin notificaciones">Aquí verás avisos de tus pedidos, reseñas y tiendas.</EmptyState>
      ) : (
        <ul className="card divide-y divide-line">
          {list.map((n) => {
            const Icon = ICON[n.type] ?? Bell;
            const body = (
              <div className="flex gap-3.5 p-4">
                <span className={`grid size-9 shrink-0 place-items-center rounded-full ${n.readAt ? 'bg-subtle text-muted' : 'bg-ink text-on-ink'}`}><Icon className="size-4" /></span>
                <div className="min-w-0 flex-1">
                  <div className={`text-sm ${n.readAt ? 'text-ink-2' : 'font-medium'}`}>{n.title}</div>
                  {n.body && <div className="mt-0.5 text-sm text-muted">{n.body}</div>}
                  <div className="mt-1 text-xs text-faint">{formatDateTime(n.createdAt)}</div>
                </div>
                {!n.readAt && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" aria-label="Sin leer" />}
              </div>
            );
            return <li key={n.id}>{n.link ? <Link href={n.link} className="block transition-colors hover:bg-subtle/60">{body}</Link> : body}</li>;
          })}
        </ul>
      )}
    </>
  );
}
