import Link from 'next/link';
import { Suspense } from 'react';
import { Heart, ShoppingBag, Bell, User, Store, Shield, Package, LogOut, ChevronDown } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/session';
import { hasRole } from '@/lib/auth/guards';
import { cartCount } from '@/lib/services/cart';
import { unreadCount } from '@/lib/services/community';
import { getCategoryTree } from '@/lib/services/catalog';
import { logoutAction } from '@/actions/auth';
import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/misc';
import { SearchBox } from './search-box';
import { Logo } from './logo';
import { ThemeToggle } from '@/components/theme-toggle';

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-4 px-4 sm:px-6">
        <Logo />
        <SearchBox className="hidden flex-1 md:block md:max-w-xl lg:max-w-2xl" />
        <div className="ml-auto flex items-center gap-1">
          <div className="hidden md:block"><ThemeToggle /></div>
          <Suspense fallback={<Skeleton className="h-9 w-40" />}>
            <HeaderActions />
          </Suspense>
        </div>
      </div>
      <div className="px-4 pb-3 md:hidden"><SearchBox /></div>
      <Suspense fallback={<div className="h-10 border-t border-line" />}>
        <CategoryNav />
      </Suspense>
    </header>
  );
}

const iconBtn = 'relative grid size-10 place-items-center rounded-full text-ink-2 transition-colors hover:bg-subtle hover:text-ink';
const dot = 'absolute top-1 right-1 grid min-w-[18px] h-[18px] place-items-center rounded-full bg-brand px-1 text-[10px] font-semibold text-white ring-2 ring-surface tabular-nums';

async function HeaderActions() {
  const user = await getCurrentUser();
  const [cart, unread] = await Promise.all([cartCount(), user ? unreadCount(user.id) : 0]);
  const cartLink = (
    <Link href="/carrito" className={iconBtn} aria-label={`Carrito, ${cart} artículos`}>
      <ShoppingBag className="size-5" />
      {cart > 0 && <span className={dot}>{cart > 99 ? '99+' : cart}</span>}
    </Link>
  );
  if (!user) {
    return (
      <>
        <Link href="/vender" className="mr-1 hidden text-sm font-medium text-ink-2 hover:text-ink lg:block">Vende en Plaza</Link>
        <Link href="/entrar" className={buttonClass('ghost', 'sm', 'hidden sm:inline-flex')}>Entrar</Link>
        <Link href="/registro" className={buttonClass('primary', 'sm', 'mr-1')}>Crear cuenta</Link>
        {cartLink}
      </>
    );
  }
  const first = user.name.split(' ')[0];
  return (
    <>
      {!user.store && <Link href="/vender" className="mr-2 hidden text-sm font-medium text-ink-2 hover:text-ink lg:block">Vende en Plaza</Link>}
      <Link href="/cuenta/favoritos" className={`${iconBtn} hidden sm:grid`} aria-label="Favoritos"><Heart className="size-5" /></Link>
      <Link href="/cuenta/notificaciones" className={iconBtn} aria-label={`Notificaciones, ${unread} sin leer`}>
        <Bell className="size-5" />
        {unread > 0 && <span className={dot}>{unread > 9 ? '9+' : unread}</span>}
      </Link>
      {cartLink}
      <details className="group relative ml-1">
        <summary className="flex items-center gap-2 rounded-full py-1 pr-2 pl-1 transition-colors hover:bg-subtle" aria-label="Menú de cuenta">
          <span className="grid size-8 place-items-center rounded-full bg-ink text-[13px] font-semibold text-on-ink">{first[0]?.toUpperCase()}</span>
          <span className="hidden max-w-24 truncate text-sm font-medium lg:block">{first}</span>
          <ChevronDown className="hidden size-3.5 text-muted transition-transform group-open:rotate-180 lg:block" />
        </summary>
        <div className="absolute top-12 right-0 z-50 w-60 rounded-xl bg-surface p-1.5 shadow-pop animate-pop">
          <div className="border-b border-line px-3 py-2.5">
            <div className="truncate text-sm font-medium">{user.name}</div>
            <div className="truncate text-xs text-muted">{user.email}</div>
          </div>
          <nav className="py-1 text-sm [&_a]:flex [&_a]:items-center [&_a]:gap-2.5 [&_a]:rounded-lg [&_a]:px-3 [&_a]:py-2 [&_a:hover]:bg-subtle [&_svg]:size-4 [&_svg]:text-muted">
            <Link href="/cuenta"><User />Mi cuenta</Link>
            <Link href="/cuenta/pedidos"><Package />Mis compras</Link>
            <Link href="/cuenta/favoritos"><Heart />Favoritos</Link>
            {user.store ? <Link href="/vendedor"><Store />Panel de vendedor</Link> : <Link href="/vender"><Store />Empieza a vender</Link>}
            {hasRole(user, 'admin') && <Link href="/admin"><Shield />Administración</Link>}
          </nav>
          <form action={logoutAction} className="border-t border-line pt-1">
            <button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink-2 hover:bg-subtle"><LogOut className="size-4 text-muted" />Cerrar sesión</button>
          </form>
        </div>
      </details>
    </>
  );
}

async function CategoryNav() {
  const tree = await getCategoryTree();
  return (
    <nav aria-label="Categorías" className="border-t border-line">
      <div className="scrollbar-none mx-auto flex h-10 max-w-[1400px] items-center gap-1 overflow-x-auto px-3 sm:px-5">
        {tree.map((c) => (
          <Link key={c.id} href={`/categoria/${c.slug}`} className="shrink-0 rounded-md px-2.5 py-1 text-[13px] font-medium text-ink-2 transition-colors hover:bg-subtle hover:text-ink">{c.name}</Link>
        ))}
        <span className="mx-1 h-4 w-px shrink-0 bg-line" />
        <Link href="/buscar?sort=nuevos" className="shrink-0 rounded-md px-2.5 py-1 text-[13px] font-medium text-ink-2 hover:bg-subtle hover:text-ink">Novedades</Link>
        <Link href="/ofertas" className="shrink-0 rounded-md px-2.5 py-1 text-[13px] font-medium text-brand hover:bg-brand-soft">Ofertas</Link>
      </div>
    </nav>
  );
}
