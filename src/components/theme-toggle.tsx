'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

type Theme = 'system' | 'light' | 'dark';
const LABEL: Record<Theme, string> = { system: 'Tema del sistema', light: 'Tema claro', dark: 'Tema oscuro' };
const NEXT: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };

/** Script que corre antes de pintar: aplica el tema guardado y evita el destello blanco. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

function apply(t: Theme) {
  const root = document.documentElement;
  if (t === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
  try {
    if (t === 'system') localStorage.removeItem('theme');
    else localStorage.setItem('theme', t);
  } catch { /* almacenamiento bloqueado: el tema dura hasta recargar */ }
}

/** Botón que alterna sistema → claro → oscuro. */
export function ThemeToggle({ className, withLabel }: { className?: string; withLabel?: boolean }) {
  const [theme, setTheme] = useState<Theme>('system');
  useEffect(() => {
    const t = document.documentElement.getAttribute('data-theme');
    // Sincroniza con lo que aplicó el script de <head> (solo existe en el navegador).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(t === 'light' || t === 'dark' ? t : 'system');
  }, []);
  const Icon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  return (
    <button
      type="button"
      onClick={() => { const n = NEXT[theme]; apply(n); setTheme(n); }}
      className={cn('flex items-center gap-2 rounded-full text-ink-2 transition-colors hover:bg-subtle hover:text-ink', withLabel ? 'px-3 py-1.5 text-sm' : 'grid size-10 place-items-center', className)}
      aria-label={`${LABEL[theme]}. Cambiar tema`}
      title={`${LABEL[theme]} (clic para cambiar)`}
    >
      <Icon className="size-[18px]" />
      {withLabel && <span>{LABEL[theme]}</span>}
    </button>
  );
}
