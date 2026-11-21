import Link from 'next/link';
import { MessageCircleQuestion, CornerDownRight, ShieldAlert } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/session';
import { listProductQuestions } from '@/lib/services/questions';
import { askQuestionAction } from '@/actions/shop';
import { ActionForm, SubmitButton } from '@/components/ui/action-form';
import { Textarea } from '@/components/ui/form';
import { formatDate } from '@/lib/utils';

/** Preguntas y respuestas públicas del producto (va dentro de un Suspense: lee la sesión). */
export async function ProductQuestions({ productId, ownerId, slug }: { productId: string; ownerId: string; slug: string }) {
  const user = await getCurrentUser();
  const questions = await listProductQuestions(productId, user?.id);
  return (
    <section id="preguntas" className="mt-16 scroll-mt-32 border-t border-line pt-10">
      <h2 className="flex items-center gap-2 text-xl font-semibold"><MessageCircleQuestion className="size-5 text-muted" />Preguntas a la tienda</h2>
      <div className="mt-6 grid gap-10 lg:grid-cols-[300px_1fr]">
        <div>
          {!user ? (
            <p className="text-sm text-muted"><Link href={`/entrar?next=${encodeURIComponent(`/producto/${slug}#preguntas`)}`} className="link">Inicia sesión</Link> para preguntarle a la tienda.</p>
          ) : user.id === ownerId ? (
            <p className="text-sm text-muted">Responde las preguntas de tus productos desde <Link href="/vendedor/preguntas" className="link">tu panel</Link>.</p>
          ) : (
            <ActionForm action={askQuestionAction.bind(null, productId)} resetOnSuccess className="space-y-2">
              <Textarea name="body" required minLength={5} maxLength={500} rows={3} placeholder="¿Tienes dudas? Pregúntale a la tienda (medidas, compatibilidad, envío…)" aria-label="Tu pregunta" />
              <SubmitButton className="w-full" pendingText="Enviando…">Preguntar</SubmitButton>
            </ActionForm>
          )}
          <p className="mt-4 flex gap-2 text-xs text-muted"><ShieldAlert className="size-4 shrink-0" />No compartas teléfonos ni correos: si compras fuera de la plataforma pierdes la compra protegida.</p>
        </div>
        <div>
          {questions.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line-strong p-8 text-center text-sm text-muted">Nadie ha preguntado todavía. ¡Haz la primera pregunta!</p>
          ) : (
            <ul className="space-y-5">
              {questions.map((qn) => (
                <li key={qn.id} className="text-sm">
                  <p className="text-ink">{qn.body}</p>
                  {qn.answer ? (
                    <p className="mt-1.5 flex gap-2 text-ink-2"><CornerDownRight className="mt-0.5 size-4 shrink-0 text-faint" /><span>{qn.answer} <span className="text-xs text-faint">· {formatDate(qn.answeredAt!)}</span></span></p>
                  ) : (
                    <p className="mt-1 text-xs text-muted">Tu pregunta · esperando respuesta de la tienda</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
