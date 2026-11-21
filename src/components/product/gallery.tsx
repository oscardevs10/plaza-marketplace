'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Expand, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type Img = { url: string; thumbUrl: string | null; alt: string | null };

/**
 * Galería del producto:
 * - celular: carrusel deslizable con puntos; escritorio: imagen grande + miniaturas.
 * - pantalla completa con zoom (clic/toque para acercar donde apuntas), deslizar, flechas y teclado.
 */
export function Gallery({ images, title }: { images: Img[]; title: string }) {
  const [i, setI] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  // Carrusel móvil: el índice sigue al desplazamiento.
  const onScroll = () => {
    const el = track.current;
    if (el) setI(Math.round(el.scrollLeft / el.clientWidth));
  };
  const goTo = (k: number) => {
    setI(k);
    track.current?.scrollTo({ left: k * track.current.clientWidth, behavior: 'smooth' });
  };

  if (!images.length) return <div className="grid aspect-square place-items-center rounded-2xl bg-subtle text-sm text-muted">Sin imagen</div>;

  return (
    <div className="flex flex-col-reverse gap-3 self-start md:flex-row md:items-start">
      {images.length > 1 && (
        <div className="hidden w-[72px] flex-col gap-2 md:flex">
          {images.map((im, k) => (
            <button key={im.url} type="button" onClick={() => goTo(k)} onMouseEnter={() => goTo(k)} aria-label={`Ver imagen ${k + 1} de ${images.length}`} aria-current={k === i}
              className={cn('aspect-square w-full overflow-hidden rounded-lg bg-subtle ring-offset-2 ring-offset-canvas transition', k === i ? 'ring-2 ring-ink' : 'opacity-70 hover:opacity-100')}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={im.thumbUrl ?? im.url} alt="" className="size-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}
      <div className="relative w-full min-w-0 flex-1">
        <div ref={track} onScroll={onScroll} className="scrollbar-none flex aspect-square snap-x snap-mandatory overflow-x-auto overflow-y-hidden rounded-2xl bg-subtle md:overflow-hidden">
          {images.map((im, k) => (
            <button key={im.url} type="button" onClick={() => dialog.current?.showModal()} className="size-full shrink-0 snap-center cursor-zoom-in" aria-label="Ver en pantalla completa">
              {/* eslint-disable-next-line @next/next/no-img-element -- imágenes re-codificadas a WebP al subirlas */}
              <img src={im.url} alt={k === 0 ? (im.alt ?? title) : ''} className="size-full object-cover" width={1200} height={1200} loading={k === 0 ? 'eager' : 'lazy'} fetchPriority={k === 0 ? 'high' : undefined} />
            </button>
          ))}
        </div>
        <button type="button" onClick={() => dialog.current?.showModal()} className="absolute right-3 bottom-3 grid size-9 place-items-center rounded-full bg-surface/90 text-ink-2 shadow-card backdrop-blur hover:text-ink" aria-label="Pantalla completa"><Expand className="size-4" /></button>
        {images.length > 1 && (
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5 md:hidden" aria-hidden>
            {images.map((im, k) => <span key={im.url} className={cn('h-1.5 rounded-full bg-white/90 shadow transition-all', k === i ? 'w-4' : 'w-1.5 opacity-60')} />)}
          </div>
        )}
      </div>
      <Lightbox ref={dialog} images={images} start={i} title={title} onChange={goTo} />
    </div>
  );
}

function Lightbox({ ref, images, start, title, onChange }: { ref: React.RefObject<HTMLDialogElement | null>; images: Img[]; start: number; title: string; onChange: (k: number) => void }) {
  const [k, setK] = useState(start);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const touch = useRef<number | null>(null);

  const go = (d: number) => {
    const n = (k + d + images.length) % images.length;
    setK(n); setZoom(null); onChange(n);
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onOpen = () => { setK(start); setZoom(null); };
    const obs = new MutationObserver(() => { if (el.open) onOpen(); });
    obs.observe(el, { attributes: true, attributeFilter: ['open'] });
    return () => obs.disconnect();
  }, [ref, start]);

  return (
    <dialog
      ref={ref}
      aria-label={`Fotos de ${title}`}
      onKeyDown={(e) => { if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none bg-black/95 p-0 text-white backdrop:bg-black/80"
    >
      <div
        className="relative flex size-full items-center justify-center overflow-hidden"
        onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (touch.current == null || zoom) return;
          const dx = e.changedTouches[0].clientX - touch.current;
          if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
          touch.current = null;
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={images[k].url}
          src={images[k].url}
          alt={images[k].alt ?? title}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setZoom(zoom ? null : { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
          }}
          onMouseMove={(e) => {
            if (!zoom) return;
            const r = e.currentTarget.getBoundingClientRect();
            setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
          }}
          style={zoom ? { transform: 'scale(2.2)', transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
          className={cn('max-h-full max-w-full select-none object-contain transition-transform duration-200 animate-fade-up', zoom ? 'cursor-zoom-out' : 'cursor-zoom-in')}
        />
        <button onClick={() => ref.current?.close()} className="absolute top-4 right-4 grid size-11 place-items-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Cerrar"><X className="size-5" /></button>
        {images.length > 1 && (
          <>
            <button onClick={() => go(-1)} className="absolute left-3 grid size-11 place-items-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Anterior"><ChevronLeft className="size-5" /></button>
            <button onClick={() => go(1)} className="absolute right-3 grid size-11 place-items-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Siguiente"><ChevronRight className="size-5" /></button>
            <div className="absolute bottom-6 text-sm text-white/70 tabular-nums">{k + 1} / {images.length}</div>
          </>
        )}
      </div>
    </dialog>
  );
}
