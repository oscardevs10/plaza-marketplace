'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tone = 'success' | 'error' | 'info';
type Toast = { id: number; message: string; tone: Tone };

/** Muestra un aviso breve desde cualquier componente de cliente: toast('Guardado'). */
export function toast(message: string, tone: Tone = 'success') {
  window.dispatchEvent(new CustomEvent<Omit<Toast, 'id'>>('app:toast', { detail: { message, tone } }));
}

let seq = 0;

/** Pila de avisos (abajo al centro; arriba de la barra inferior en celular). Se cierran solos. */
export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    const onToast = (e: Event) => {
      const { message, tone } = (e as CustomEvent<Omit<Toast, 'id'>>).detail;
      const id = ++seq;
      setItems((l) => [...l.slice(-2), { id, message, tone }]);
      setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), tone === 'error' ? 6000 : 3500);
    };
    window.addEventListener('app:toast', onToast);
    return () => window.removeEventListener('app:toast', onToast);
  }, []);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6">
      {items.map((t) => {
        const Icon = t.tone === 'error' ? AlertCircle : t.tone === 'info' ? Info : CheckCircle2;
        return (
          <div key={t.id} role={t.tone === 'error' ? 'alert' : 'status'} className="pointer-events-auto flex max-w-md items-center gap-2.5 rounded-xl bg-ink py-2.5 pr-2 pl-3.5 text-sm text-on-ink shadow-pop animate-fade-up">
            <Icon className={cn('size-4 shrink-0', t.tone === 'error' ? 'text-danger' : t.tone === 'success' ? 'text-success' : '')} />
            <span>{t.message}</span>
            <button onClick={() => setItems((l) => l.filter((x) => x.id !== t.id))} className="ml-1 grid size-6 place-items-center rounded-md opacity-60 hover:opacity-100" aria-label="Cerrar aviso"><X className="size-3.5" /></button>
          </div>
        );
      })}
    </div>
  );
}
