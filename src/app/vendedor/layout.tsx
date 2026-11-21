import { Suspense, type ReactNode } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { BarChart3, Boxes, CirclePlus, LayoutDashboard, Package, MessageCircleQuestion, Settings, ShoppingBag, Star, Store, TicketPercent, TriangleAlert } from 'lucide-react';
import { DashboardShell, type NavItem } from '@/components/dashboard-shell';
import { Skeleton } from '@/components/ui/misc';
import { getCurrentUser } from '@/lib/auth/session';

export const metadata: Metadata = { title: { default: 'Panel de vendedor', template: '%s · Vendedor' }, robots: { index: false } };

const nav: NavItem[] = [
  { href: '/vendedor', label: 'Resumen', icon: <LayoutDashboard />, exact: true },
  { href: '/vendedor/productos', label: 'Productos', icon: <Package />, exclude: ['/vendedor/productos/nuevo'] },
  { href: '/vendedor/productos/nuevo', label: 'Publicar', icon: <CirclePlus /> },
  { href: '/vendedor/pedidos', label: 'Pedidos', icon: <ShoppingBag /> },
  { href: '/vendedor/inventario', label: 'Inventario', icon: <Boxes /> },
  { href: '/vendedor/preguntas', label: 'Preguntas', icon: <MessageCircleQuestion /> },
  { href: '/vendedor/resenas', label: 'Reseñas', icon: <Star /> },
  { href: '/vendedor/estadisticas', label: 'Estadísticas', icon: <BarChart3 /> },
  { href: '/vendedor/cupones', label: 'Cupones', icon: <TicketPercent /> },
  { href: '/vendedor/tienda', label: 'Mi tienda', icon: <Store /> },
  { href: '/vendedor/configuracion', label: 'Configuración', icon: <Settings /> },
];

export default function SellerLayout({ children }: { children: ReactNode }) {
  return (
    <DashboardShell title="Panel de vendedor" nav={nav} subtitle={<Suspense fallback={<Skeleton className="h-3 w-28" />}><StoreLink /></Suspense>}>
      <Suspense><SuspendedBanner /></Suspense>
      {children}
    </DashboardShell>
  );
}

async function StoreLink() {
  const store = (await getCurrentUser())?.store;
  if (!store) return null;
  return <Link href={`/tienda/${store.slug}`} className="hover:text-ink hover:underline" title="Ver mi tienda pública">{store.name} ↗</Link>;
}

/** La sesión se lee aquí solo para mostrar el aviso; cada página y acción verifica permisos por su cuenta. */
async function SuspendedBanner() {
  const store = (await getCurrentUser())?.store;
  if (store?.status !== 'suspended') return null;
  return (
    <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-semibold">Tu tienda está suspendida</p>
        <p className="mt-0.5">Tus productos no se muestran a los compradores y no puedes hacer cambios. Puedes consultar tu información, pero para reactivarla contacta a soporte.</p>
      </div>
    </div>
  );
}
