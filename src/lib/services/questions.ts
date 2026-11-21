import 'server-only';
import { and, desc, eq, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { notify } from '@/lib/notifications';
import { audit } from '@/lib/security';

const { productQuestions: q, products, stores, users } = schema;
export class QuestionError extends AppError {}

// Se bloquean correos y teléfonos: los tratos fuera de la plataforma dejan a la persona sin compra protegida.
const CONTACT = /[\w.+-]+@[\w-]+\.[\w.]+|(?:\+?52[\s-]?)?(?:\d[\s-]?){10}/;

function clean(text: string, min: number, max: number) {
  const body = text.trim().replace(/\s+\n/g, '\n');
  if (body.length < min || body.length > max) throw new QuestionError(`Escribe entre ${min} y ${max} caracteres`);
  if (CONTACT.test(body)) throw new QuestionError('Por seguridad no se permiten correos ni teléfonos. Toda la compra se hace dentro de la plataforma.');
  return body;
}

export async function askQuestion(user: { id: string }, productId: string, text: string) {
  const body = clean(text, 5, 500);
  const [p] = await db.select({ storeId: products.storeId, title: products.title, slug: products.slug, ownerId: stores.ownerId, status: products.status })
    .from(products).innerJoin(stores, eq(stores.id, products.storeId)).where(eq(products.id, productId));
  if (!p || p.status !== 'active') throw new QuestionError('Producto no disponible');
  if (p.ownerId === user.id) throw new QuestionError('No puedes preguntar en tu propio producto');
  const [{ pending }] = await db.select({ pending: sql<number>`count(*)::int` }).from(q)
    .where(and(eq(q.productId, productId), eq(q.userId, user.id), isNull(q.answeredAt)));
  if (pending >= 3) throw new QuestionError('Ya tienes 3 preguntas sin responder en este producto. Espera la respuesta de la tienda.');
  await db.insert(q).values({ productId, storeId: p.storeId, userId: user.id, body });
  await notify(p.ownerId, { type: 'new_question', title: 'Tienes una pregunta nueva', body: `En "${p.title}": ${body.slice(0, 120)}`, link: '/vendedor/preguntas' }, { email: true });
}

/** Respuesta pública de la tienda. Solo la tienda dueña del producto puede responder. */
export async function answerQuestion(store: { id: string }, userId: string, questionId: string, text: string) {
  const answer = clean(text, 2, 1000);
  const [row] = await db.update(q).set({ answer, answeredBy: userId, answeredAt: new Date() })
    .where(and(eq(q.id, questionId), eq(q.storeId, store.id))).returning({ userId: q.userId, productId: q.productId });
  if (!row) throw new QuestionError('Pregunta no encontrada');
  const [p] = await db.select({ slug: products.slug, title: products.title }).from(products).where(eq(products.id, row.productId));
  await notify(row.userId, { type: 'question_answered', title: 'La tienda respondió tu pregunta', body: `"${p.title}": ${answer.slice(0, 140)}`, link: `/producto/${p.slug}#preguntas` }, { email: true });
  await audit(userId, 'question.answered', 'question', questionId);
}

/** Ocultar (tienda) preguntas ofensivas o spam. */
export async function setQuestionVisibility(store: { id: string }, userId: string, questionId: string, status: 'published' | 'hidden') {
  const r = await db.update(q).set({ status }).where(and(eq(q.id, questionId), eq(q.storeId, store.id))).returning({ id: q.id });
  if (!r.length) throw new QuestionError('Pregunta no encontrada');
  await audit(userId, `question.${status}`, 'question', questionId);
}

/** Públicas: las respondidas. La persona que pregunta también ve las suyas pendientes. */
export async function listProductQuestions(productId: string, viewerId?: string | null) {
  return db.select({ id: q.id, body: q.body, answer: q.answer, answeredAt: q.answeredAt, createdAt: q.createdAt, mine: viewerId ? sql<boolean>`${q.userId} = ${viewerId}` : sql<boolean>`false` })
    .from(q)
    .where(and(eq(q.productId, productId), eq(q.status, 'published'), viewerId ? or(isNotNull(q.answeredAt), eq(q.userId, viewerId)) : isNotNull(q.answeredAt)))
    .orderBy(desc(q.createdAt)).limit(30);
}

export async function listStoreQuestions(storeId: string, filter: 'pending' | 'answered' | 'all') {
  return db.select({
    id: q.id, body: q.body, answer: q.answer, answeredAt: q.answeredAt, createdAt: q.createdAt, status: q.status,
    productTitle: products.title, productSlug: products.slug, asker: users.name,
  }).from(q).innerJoin(products, eq(products.id, q.productId)).innerJoin(users, eq(users.id, q.userId))
    .where(and(eq(q.storeId, storeId), filter === 'pending' ? isNull(q.answeredAt) : filter === 'answered' ? isNotNull(q.answeredAt) : undefined))
    .orderBy(filter === 'answered' ? desc(q.answeredAt) : desc(q.createdAt)).limit(100);
}

export async function pendingQuestionCount(storeId: string) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(q).where(and(eq(q.storeId, storeId), isNull(q.answeredAt), eq(q.status, 'published')));
  return r.n;
}
