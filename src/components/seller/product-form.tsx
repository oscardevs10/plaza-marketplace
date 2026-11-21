'use client';

import { startTransition, useActionState, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, ImagePlus, Loader2, Plus, Trash2, X } from 'lucide-react';
import type { ActionState } from '@/lib/errors';
import { FormMessage } from '@/components/ui/action-form';
import { Button, buttonClass } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { centsToInput, cn } from '@/lib/utils';
import { CONDITIONS } from './constants';

const MAX_IMAGES = 10;

type Category = { id: number; name: string; children: { id: number; name: string }[] };
type Variant = { id: string; name: string; sku: string | null; priceOverride: number | null; stock: number };
export type ProductFormValues = {
  status: string; title: string; description: string; price: number; salePrice: number | null; categoryId: number; brand: string | null;
  sku: string | null; condition: 'new' | 'used' | 'refurbished'; weightGrams: number | null; lengthCm: number | null; widthCm: number | null;
  heightCm: number | null; shippingInfo: string | null; images: { id: string; url: string; thumbUrl: string | null }[]; variants: Variant[];
};

/**
 * Formulario de producto (alta y edición). Se envía con onSubmit + startTransition para que React no reinicie
 * los campos cuando el servidor responde con un error. Tras guardar, la acción redirige y el formulario se vuelve a montar.
 */
export function ProductForm({ action, categories, product }: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>; categories: Category[]; product?: ProductFormValues;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [images, setImages] = useState(product?.images ?? []);
  const [files, setFiles] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const initialVariants = product?.variants.length ? product.variants : [{ id: '', name: 'Único', sku: null, priceOverride: null, stock: 1 }];
  const [rows, setRows] = useState(initialVariants.map((v, i) => ({ key: v.id || `n${i}`, v })));
  const nextKey = useRef(0);

  const total = images.length + files.length;
  const status = product?.status;

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => formAction(fd));
  }

  function move(i: number, d: -1 | 1) {
    setImages((list) => {
      const next = [...list];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });
  }

  function clearFiles() {
    if (fileInput.current) fileInput.current.value = '';
    setFiles([]);
  }

  return (
    <form onSubmit={submit} className="grid gap-4 lg:grid-cols-3" encType="multipart/form-data">
      <div className="space-y-4 lg:col-span-2">
        <section className="card space-y-4 p-5">
          <h2 className="text-sm font-semibold">Información básica</h2>
          <Field label="Título" htmlFor="title" hint="Lo que un comprador escribiría para encontrarlo. Ej.: Audífonos inalámbricos Sony WH-1000XM5 negros">
            <Input id="title" name="title" required minLength={3} maxLength={140} defaultValue={product?.title} />
          </Field>
          <Field label="Descripción" htmlFor="description" hint="Características, materiales, medidas, qué incluye la caja. Máximo 5,000 caracteres.">
            <Textarea id="description" name="description" rows={8} maxLength={5000} defaultValue={product?.description} />
          </Field>
        </section>

        <section className="card p-5">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Imágenes</h2>
            <span className={cn('text-xs tabular-nums', total > MAX_IMAGES ? 'text-danger' : 'text-muted')}>{total} / {MAX_IMAGES}</span>
          </div>
          <p className="mb-4 text-xs text-muted">La primera imagen es la portada. JPG, PNG, WEBP o AVIF de al menos 200 × 200 px y hasta 8 MB. Necesitas al menos una para publicar.</p>
          {images.length > 0 && (
            <ul className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {images.map((im, i) => (
                <li key={im.id} className="group relative overflow-hidden rounded-lg border border-line bg-subtle">
                  <input type="hidden" name="keepImage" value={im.id} />
                  {/* eslint-disable-next-line @next/next/no-img-element -- miniatura ya optimizada */}
                  <img src={im.thumbUrl ?? im.url} alt="" className="aspect-square w-full object-cover" />
                  {i === 0 && <span className="absolute top-1.5 left-1.5 rounded bg-ink px-1.5 py-0.5 text-[10px] font-semibold text-on-ink">Portada</span>}
                  <div className="absolute inset-x-1.5 bottom-1.5 flex justify-between gap-1">
                    <span className="flex gap-1">
                      <IconBtn label="Mover antes" disabled={i === 0} onClick={() => move(i, -1)}><ArrowLeft /></IconBtn>
                      <IconBtn label="Mover después" disabled={i === images.length - 1} onClick={() => move(i, 1)}><ArrowRight /></IconBtn>
                    </span>
                    <IconBtn label="Quitar imagen" onClick={() => setImages((l) => l.filter((x) => x.id !== im.id))}><Trash2 /></IconBtn>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {previews.length > 0 && (
            <div className="mb-4">
              <div className="mb-2 flex items-center justify-between text-xs text-muted">
                <span>Nuevas ({files.length}) · se agregan al final, en este orden</span>
                <button type="button" onClick={clearFiles} className="inline-flex items-center gap-1 hover:text-ink"><X className="size-3.5" />Quitar selección</button>
              </div>
              <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:) */}
                {previews.map((u) => <li key={u}><img src={u} alt="" className="aspect-square w-full rounded-lg border border-line object-cover" /></li>)}
              </ul>
            </div>
          )}
          <label className={cn('flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm transition-colors hover:bg-subtle', total >= MAX_IMAGES && 'pointer-events-none opacity-50')}>
            <ImagePlus className="size-5 text-muted" />
            <span className="font-medium">Agregar imágenes</span>
            <span className="text-xs text-muted">Puedes elegir varias a la vez</span>
            <input ref={fileInput} type="file" name="images" multiple accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only"
              onChange={(e) => setFiles(Array.from(e.currentTarget.files ?? []))} />
          </label>
          {total > MAX_IMAGES && <p className="mt-2 text-xs text-danger">Máximo {MAX_IMAGES} imágenes: quita algunas antes de guardar.</p>}
        </section>

        <section className="card p-5">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Variantes e inventario</h2>
            <Button size="sm" variant="secondary" disabled={rows.length >= 50}
              onClick={() => setRows((r) => [...r, { key: `new${nextKey.current++}`, v: { id: '', name: '', sku: null, priceOverride: null, stock: 0 } }])}>
              <Plus className="size-3.5" />Agregar variante
            </Button>
          </div>
          <p className="mb-4 text-xs text-muted">Talla, color o modelo. Si tu producto no tiene opciones, deja una sola variante llamada “Único”. El precio propio es opcional.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="text-left text-xs font-medium text-muted"><th className="pb-2 font-medium">Nombre</th><th className="pb-2 font-medium">SKU</th><th className="pb-2 font-medium">Precio propio</th><th className="pb-2 font-medium">Existencias</th><th className="w-10" /></tr></thead>
              <tbody>
                {rows.map(({ key, v }) => (
                  <tr key={key} className="align-top">
                    <td className="py-1 pr-2">
                      <input type="hidden" name="variantId" value={v.id} />
                      <Input name="variantName" aria-label="Nombre de la variante" required maxLength={60} defaultValue={v.name} placeholder="M / Rojo" />
                    </td>
                    <td className="py-1 pr-2"><Input name="variantSku" aria-label="SKU de la variante" maxLength={60} defaultValue={v.sku ?? ''} /></td>
                    <td className="py-1 pr-2"><Input name="variantPrice" aria-label="Precio propio" inputMode="decimal" placeholder="—" defaultValue={centsToInput(v.priceOverride)} /></td>
                    <td className="py-1 pr-2"><Input name="variantStock" aria-label="Existencias" type="number" min={0} max={100000} step={1} required defaultValue={v.stock} className="w-24" /></td>
                    <td className="py-1">
                      <button type="button" aria-label="Quitar variante" disabled={rows.length === 1} onClick={() => setRows((r) => r.filter((x) => x.key !== key))}
                        className="grid size-10 place-items-center rounded-lg text-muted hover:bg-subtle hover:text-danger disabled:opacity-30"><Trash2 className="size-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="space-y-4">
        <section className="card space-y-4 p-5">
          <h2 className="text-sm font-semibold">Precio</h2>
          <Field label="Precio (MXN)" htmlFor="price"><Input id="price" name="price" inputMode="decimal" required placeholder="1299.00" defaultValue={centsToInput(product?.price)} /></Field>
          <Field label="Precio de oferta" htmlFor="salePrice" hint="Opcional. Debe ser menor al precio normal.">
            <Input id="salePrice" name="salePrice" inputMode="decimal" placeholder="—" defaultValue={centsToInput(product?.salePrice)} />
          </Field>
        </section>

        <section className="card space-y-4 p-5">
          <h2 className="text-sm font-semibold">Organización</h2>
          <Field label="Categoría" htmlFor="categoryId">
            <Select id="categoryId" name="categoryId" required defaultValue={product?.categoryId ?? ''}>
              <option value="" disabled>Elige una categoría</option>
              {categories.map((c) => c.children.length ? (
                <optgroup key={c.id} label={c.name}>
                  {c.children.map((ch) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
                </optgroup>
              ) : <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Condición" htmlFor="condition">
            <Select id="condition" name="condition" defaultValue={product?.condition ?? 'new'}>
              {Object.entries(CONDITIONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
          </Field>
          <Field label="Marca" htmlFor="brand"><Input id="brand" name="brand" maxLength={60} defaultValue={product?.brand ?? ''} /></Field>
          <Field label="SKU" htmlFor="sku" hint="Tu código interno (opcional)."><Input id="sku" name="sku" maxLength={60} defaultValue={product?.sku ?? ''} /></Field>
        </section>

        <section className="card space-y-4 p-5">
          <h2 className="text-sm font-semibold">Envío</h2>
          <Field label="Peso (g)" htmlFor="weightGrams"><Input id="weightGrams" name="weightGrams" type="number" min={0} step={1} defaultValue={product?.weightGrams ?? ''} /></Field>
          <div>
            <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Dimensiones del paquete (cm)</span>
            <div className="grid grid-cols-3 gap-2">
              <Input name="lengthCm" type="number" min={0} step={1} placeholder="Largo" aria-label="Largo en cm" defaultValue={product?.lengthCm ?? ''} />
              <Input name="widthCm" type="number" min={0} step={1} placeholder="Ancho" aria-label="Ancho en cm" defaultValue={product?.widthCm ?? ''} />
              <Input name="heightCm" type="number" min={0} step={1} placeholder="Alto" aria-label="Alto en cm" defaultValue={product?.heightCm ?? ''} />
            </div>
          </div>
          <Field label="Información de envío" htmlFor="shippingInfo" hint="Ej.: Se envía en caja original. Entrega en 3 a 5 días hábiles.">
            <Textarea id="shippingInfo" name="shippingInfo" rows={3} maxLength={500} defaultValue={product?.shippingInfo ?? ''} />
          </Field>
        </section>
      </div>

      <div className="sticky bottom-3 z-20 lg:col-span-3">
        <div className="flex flex-wrap items-center justify-end gap-2 rounded-xl border border-line bg-surface/95 px-4 py-3 shadow-lift backdrop-blur">
          <div className="mr-auto min-w-0 [&>p]:mt-0">{!pending && <FormMessage state={state} />}</div>
          {pending && <Loader2 className="size-4 animate-spin text-muted" aria-label="Guardando" />}
          {status === 'suspended' ? (
            <button type="submit" name="intent" value="keep" disabled={pending} className={buttonClass('primary')}>Guardar cambios</button>
          ) : status === 'active' ? (
            <>
              <button type="submit" name="intent" value="publish" disabled={pending} className={buttonClass('primary', 'md', 'order-last')}>Guardar cambios</button>
              <button type="submit" name="intent" value="draft" disabled={pending} className={buttonClass('secondary')}>Pasar a borrador</button>
            </>
          ) : (
            <>
              <button type="submit" name="intent" value={status === 'paused' ? 'keep' : 'draft'} disabled={pending} className={buttonClass('secondary')}>
                {status === 'paused' ? 'Guardar cambios' : 'Guardar borrador'}
              </button>
              <button type="submit" name="intent" value="publish" disabled={pending} className={buttonClass('brand')}>Publicar</button>
            </>
          )}
        </div>
      </div>
    </form>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}
      className="grid size-7 place-items-center rounded-md bg-surface/90 text-ink-2 shadow-sm backdrop-blur hover:text-ink disabled:opacity-40 [&_svg]:size-3.5">
      {children}
    </button>
  );
}
