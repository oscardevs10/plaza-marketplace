import Link from 'next/link';
import { MessageCircleQuestion, EyeOff, Eye } from 'lucide-react';
import { requireSeller } from '@/lib/auth/guards';
import { listStoreQuestions, pendingQuestionCount } from '@/lib/services/questions';
import { answerQuestionAction, questionVisibilityAction } from '@/actions/seller';
import { ActionForm, SubmitButton } from '@/components/ui/action-form';
import { Textarea } from '@/components/ui/form';
import { Badge, EmptyState, PageHeader } from '@/components/ui/misc';
import { FilterTabs, param, type SP } from '@/components/seller/ui';
import { formatDateTime } from '@/lib/utils';

export const metadata = { title: 'Preguntas' };

export default async function SellerQuestions({ searchParams }: { searchParams: SP }) {
  const { store } = await requireSeller();
  const sp = await searchParams;
  const filter = (['pending', 'answered', 'all'] as const).find((f) => f === param(sp, 'ver')) ?? 'pending';
  const [items, pending] = await Promise.all([listStoreQuestions(store.id, filter), pendingQuestionCount(store.id)]);

  return (
    <>
      <PageHeader title="Preguntas" description="Responde rápido: una respuesta clara suele convertirse en venta. Las respuestas son públicas." />
      <FilterTabs items={[
        { label: 'Sin responder', href: '/vendedor/preguntas', active: filter === 'pending', count: pending },
        { label: 'Respondidas', href: '/vendedor/preguntas?ver=answered', active: filter === 'answered' },
        { label: 'Todas', href: '/vendedor/preguntas?ver=all', active: filter === 'all' },
      ]} />
      {items.length === 0 ? (
        <EmptyState icon={<MessageCircleQuestion className="size-5" />} title={filter === 'pending' ? 'No tienes preguntas pendientes' : 'Sin preguntas'}>
          Cuando alguien pregunte en uno de tus productos te avisaremos por notificación y correo.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {items.map((q) => (
            <li key={q.id} className="card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                <Link href={`/producto/${q.productSlug}#preguntas`} className="font-medium text-ink-2 hover:underline">{q.productTitle}</Link>
                <span className="flex items-center gap-2">{q.status === 'hidden' && <Badge>Oculta</Badge>}{q.asker.split(' ')[0]} · {formatDateTime(q.createdAt)}</span>
              </div>
              <p className="mt-2 text-sm">{q.body}</p>
              {q.answer && <p className="mt-2 rounded-lg bg-subtle p-3 text-sm text-ink-2"><span className="font-medium text-ink">Tu respuesta:</span> {q.answer}</p>}
              <div className="mt-3 flex flex-wrap items-start gap-2">
                <ActionForm action={answerQuestionAction.bind(null, q.id)} className="min-w-0 flex-1 space-y-2">
                  <Textarea name="answer" required minLength={2} maxLength={1000} rows={2} defaultValue={q.answer ?? ''} placeholder="Escribe tu respuesta…" aria-label="Respuesta" className="min-h-16" />
                  <SubmitButton size="sm" pendingText="Publicando…">{q.answer ? 'Actualizar respuesta' : 'Responder'}</SubmitButton>
                </ActionForm>
                <ActionForm action={questionVisibilityAction.bind(null, q.id, q.status === 'hidden' ? 'published' : 'hidden')}>
                  <SubmitButton size="sm" variant="ghost">{q.status === 'hidden' ? <><Eye className="size-3.5" />Mostrar</> : <><EyeOff className="size-3.5" />Ocultar</>}</SubmitButton>
                </ActionForm>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
