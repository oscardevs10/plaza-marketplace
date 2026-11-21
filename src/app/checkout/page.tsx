import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { Lock, Truck, MailWarning, FlaskConical } from 'lucide-react';
import { requireUser } from '@/lib/auth/guards';
import { loadCart } from '@/lib/services/cart';
import { availableProviders } from '@/lib/payments/providers';
import { db, schema } from '@/lib/db';
import { checkoutAction } from '@/actions/shop';
import { resendVerificationAction } from '@/actions/auth';
import { ActionForm, SubmitButton } from '@/components/ui/action-form';
import { AddressFields } from '@/components/checkout/address-fields';
import { Input } from '@/components/ui/form';
import { buttonClass } from '@/components/ui/button';
import { Badge } from '@/components/ui/misc';
import { formatMoney } from '@/lib/utils';
import { needsEmailCheck } from '@/lib/config';

export const metadata: Metadata = { title: 'Finalizar compra', robots: { index: false } };

/**
 * Checkout. Los cupones se previsualizan con un formulario GET (?cupon_<tienda>=CÓDIGO) y viajan como
 * campos ocultos al confirmar; el servidor recalcula todo de nuevo al crear el pedido.
 */
export default async function CheckoutPage(props: PageProps<'/checkout'>) {
  const user = await requireUser('/checkout');
  const sp = await props.searchParams;
  const coupons: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) if (k.startsWith('cupon_') && typeof v === 'string' && v.trim()) coupons[k.slice(6)] = v.trim().slice(0, 30);

  const [cart, saved] = await Promise.all([
    loadCart(coupons),
    db.select().from(schema.addresses).where(eq(schema.addresses.userId, user.id)).orderBy(desc(schema.addresses.isDefault), desc(schema.addresses.createdAt)).limit(6),
  ]);
  if (!cart.groups.length) redirect('/carrito');
  if (cart.hasProblems) redirect('/carrito');
  const providers = availableProviders();
  const blocked = needsEmailCheck(user) || providers.length === 0;

  return (
    <main className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Finalizar compra</h1>
        <span className="flex items-center gap-1.5 text-xs text-muted"><Lock className="size-3.5" />Pago seguro</span>
      </div>

      {needsEmailCheck(user) && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">
          <span className="flex items-center gap-2"><MailWarning className="size-4" />Confirma tu correo ({user.email}) para poder comprar.</span>
          <ActionForm action={resendVerificationAction}><SubmitButton size="sm" variant="secondary">Reenviar enlace</SubmitButton></ActionForm>
        </div>
      )}

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_380px]">
        <ActionForm action={checkoutAction} id="checkout" className="space-y-6">
          {Object.entries(coupons).map(([sid, code]) => <input key={sid} type="hidden" name={`coupon:${sid}`} value={code} />)}
          <section className="card p-5 sm:p-6">
            <h2 className="flex items-center gap-2 font-semibold"><span className="grid size-6 place-items-center rounded-full bg-ink text-xs text-on-ink">1</span>Dirección de entrega</h2>
            <div className="mt-5"><AddressFields saved={saved} defaultName={user.name} /></div>
          </section>

          <section className="card p-5 sm:p-6">
            <h2 className="flex items-center gap-2 font-semibold"><span className="grid size-6 place-items-center rounded-full bg-ink text-xs text-on-ink">2</span>Método de envío</h2>
            <ul className="mt-4 space-y-2">
              {cart.groups.map((g) => (
                <li key={g.store.id} className="flex items-center justify-between gap-4 rounded-xl border border-line p-3.5 text-sm">
                  <span className="flex items-center gap-3"><Truck className="size-4 text-muted" /><span><span className="font-medium">Envío estándar</span> · {g.store.name}<span className="block text-xs text-muted">Con número de guía para seguimiento</span></span></span>
                  <span className="font-medium tabular-nums">{g.shipping ? formatMoney(g.shipping) : <span className="text-success">Gratis</span>}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card p-5 sm:p-6">
            <h2 className="flex items-center gap-2 font-semibold"><span className="grid size-6 place-items-center rounded-full bg-ink text-xs text-on-ink">3</span>Método de pago</h2>
            {providers.length === 0 ? (
              <p className="mt-4 text-sm text-danger">No hay métodos de pago disponibles en este momento.</p>
            ) : (
              <div className="mt-4 space-y-2">
                {providers.map((p, i) => (
                  <label key={p.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-4 transition-colors has-[:checked]:border-ink has-[:checked]:ring-1 has-[:checked]:ring-ink">
                    <input type="radio" name="provider" value={p.id} defaultChecked={i === 0} className="mt-0.5 size-4 accent-ink" />
                    <span className="flex-1">
                      <span className="flex items-center gap-2 text-sm font-medium">{p.label}{p.id === 'sandbox' && <Badge tone="warning"><FlaskConical className="size-3" />SANDBOX</Badge>}</span>
                      <span className="mt-0.5 block text-xs text-muted">{p.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </section>
          <p className="text-xs text-muted">Al confirmar aceptas los <Link href="/legal/terminos" className="link">términos y condiciones</Link>. Apartamos tus productos durante 60 minutos mientras completas el pago.</p>
        </ActionForm>

        <aside className="lg:sticky lg:top-32 lg:self-start">
          <div className="card p-5">
            <h2 className="font-semibold">Tu pedido</h2>
            <div className="mt-4 space-y-5">
              {cart.groups.map((g) => (
                <div key={g.store.id} className="space-y-2.5">
                  <div className="text-xs font-medium tracking-wide text-muted uppercase">{g.store.name}</div>
                  {g.lines.map((l) => (
                    <div key={l.variantId} className="flex gap-3 text-sm">
                      <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-subtle">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {l.image && <img src={l.image} alt="" className="size-full object-cover" />}
                        <span className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-ink text-[10px] font-semibold text-on-ink">{l.quantity}</span>
                      </div>
                      <div className="min-w-0 flex-1"><div className="line-clamp-2 leading-snug">{l.title}</div>{l.variantName !== 'Único' && <div className="text-xs text-muted">{l.variantName}</div>}</div>
                      <div className="tabular-nums">{formatMoney(l.unitPrice * l.quantity)}</div>
                    </div>
                  ))}
                  <form className="flex gap-2" action="/checkout">
                    {Object.entries(coupons).filter(([sid]) => sid !== g.store.id).map(([sid, code]) => <input key={sid} type="hidden" name={`cupon_${sid}`} value={code} />)}
                    <Input name={`cupon_${g.store.id}`} defaultValue={coupons[g.store.id] ?? ''} placeholder="Cupón de la tienda" aria-label={`Cupón de ${g.store.name}`} className="h-9 uppercase" maxLength={30} />
                    <button className={buttonClass('secondary', 'sm', 'h-9')}>Aplicar</button>
                  </form>
                  {g.coupon && (g.coupon.problem ? <p className="text-xs text-danger">{g.coupon.problem}</p> : <p className="text-xs text-success">Cupón {g.coupon.code}: −{formatMoney(g.discount)}</p>)}
                </div>
              ))}
            </div>
            <dl className="mt-5 space-y-2 border-t border-line pt-4 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Productos</dt><dd className="tabular-nums">{formatMoney(cart.totals.subtotal)}</dd></div>
              {cart.totals.discount > 0 && <div className="flex justify-between text-success"><dt>Descuentos</dt><dd className="tabular-nums">−{formatMoney(cart.totals.discount)}</dd></div>}
              <div className="flex justify-between"><dt className="text-muted">Envío</dt><dd className="tabular-nums">{cart.totals.shipping ? formatMoney(cart.totals.shipping) : 'Gratis'}</dd></div>
              <div className="flex justify-between border-t border-line pt-3 text-lg font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatMoney(cart.totals.total)}</dd></div>
            </dl>
            <SubmitButtonOutside blocked={blocked} total={cart.totals.total} />
          </div>
        </aside>
      </div>
    </main>
  );
}

function SubmitButtonOutside({ blocked, total }: { blocked: boolean; total: number }) {
  return (
    <button form="checkout" type="submit" disabled={blocked} className={buttonClass('brand', 'lg', 'mt-5 w-full')}>
      <Lock className="size-4" />Pagar {formatMoney(total)}
    </button>
  );
}
