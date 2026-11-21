import { Suspense, cache } from 'react';
import Link from 'next/link';
import { ArrowRight, ShieldCheck, Star, Store as StoreIcon, Cpu, Shirt, Sofa, Dumbbell, Sparkles, BookOpen, Tag } from 'lucide-react';
import { getHomeSections, getProductsByIds, type ProductCard } from '@/lib/services/catalog';
import { getCurrentUser } from '@/lib/auth/session';
import { recommendedFor } from '@/lib/services/recommendations';
import { ProductGrid, ProductGridSkeleton } from '@/components/product/product-card';
import { ButtonLink } from '@/components/ui/button';
import { Stars, Skeleton, DemoBadge } from '@/components/ui/misc';
import { APP_NAME } from '@/lib/config';
import { RecentlyViewed } from '@/components/product/recently-viewed';

// Una sola consulta por petición, compartida por todas las secciones (React.cache).
// Datos en caché (se renuevan cada minuto o al cambiar el catálogo): la portada se sirve prerenderizada.
const sections = cache(getHomeSections);

export default function Home() {
  return (
    <main className="mx-auto max-w-[1400px] px-4 sm:px-6">
      <Hero />
      <Suspense fallback={<CategoriesSkeleton />}><PopularCategories /></Suspense>
      <Section title="Ofertas especiales" href="/ofertas" icon={<Tag className="size-4 text-brand" />}><Rail pick="offers" /></Section>
      <Section title="Lo más vendido" href="/buscar?sort=vendidos"><Rail pick="bestSellers" /></Section>
      <Suspense fallback={null}><Recommended /></Suspense>
      <Section title="Destacados de la semana" href="/buscar"><Rail pick="featured" count={10} /></Section>
      <Suspense fallback={<div className="mt-16 h-64 skeleton" />}><FeaturedStores /></Suspense>
      <Section title="Mejor calificados" href="/buscar?sort=calificacion" icon={<Star className="size-4 fill-star text-star" />}><Rail pick="topRated" /></Section>
      <Section title="Recién llegados" href="/buscar?sort=nuevos"><Rail pick="newest" /></Section>
      <RecentlyViewed />
      <SellCta />
    </main>
  );
}

function Hero() {
  return (
    <section className="mt-6 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
      <div className="relative overflow-hidden rounded-2xl bg-[#0c0c10] px-7 py-10 text-white ring-1 ring-white/5 sm:px-12 sm:py-14">
        <div className="absolute -top-24 -right-24 size-80 rounded-full bg-brand/30 blur-3xl" aria-hidden />
        <div className="relative max-w-lg animate-fade-up">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium ring-1 ring-white/15 ring-inset"><ShieldCheck className="size-3.5" /> Compra protegida en cada pedido</span>
          <h1 className="mt-5 text-4xl leading-[1.05] font-semibold sm:text-5xl">Todo lo que buscas, de tiendas que te van a encantar.</h1>
          <p className="mt-4 text-base text-white/70 sm:text-lg">Productos de vendedores independientes de todo México, con reseñas verificadas y pagos seguros.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/ofertas" variant="brand" size="lg">Ver ofertas <ArrowRight className="size-4" /></ButtonLink>
            <ButtonLink href="/buscar" size="lg" className="bg-white/10 text-white ring-1 ring-white/20 ring-inset hover:bg-white/15">Explorar todo</ButtonLink>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
        <Link href="/categoria/electronica" className="group relative flex min-h-40 flex-col justify-end overflow-hidden rounded-2xl bg-subtle p-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&q=75&auto=format&fit=crop" alt="" className="absolute inset-0 size-full object-cover transition-transform duration-700 group-hover:scale-105" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
          <div className="relative text-white"><div className="text-xs font-medium text-white/80">Electrónica</div><div className="text-lg font-semibold">Audio que se siente</div></div>
        </Link>
        <Link href="/categoria/hogar" className="group relative flex min-h-40 flex-col justify-end overflow-hidden rounded-2xl bg-subtle p-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=800&q=75&auto=format&fit=crop" alt="" className="absolute inset-0 size-full object-cover transition-transform duration-700 group-hover:scale-105" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
          <div className="relative text-white"><div className="text-xs font-medium text-white/80">Hogar</div><div className="text-lg font-semibold">Detalles para tu casa</div></div>
        </Link>
      </div>
    </section>
  );
}

const ICONS: Record<string, typeof Cpu> = { cpu: Cpu, shirt: Shirt, sofa: Sofa, dumbbell: Dumbbell, sparkles: Sparkles, 'book-open': BookOpen };

async function PopularCategories() {
  const { popularCategories } = await sections();
  return (
    <section className="mt-10" aria-label="Categorías populares">
      <h2 className="sr-only">Categorías populares</h2>
      <div className="scrollbar-none -mx-4 flex gap-3 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-3 sm:px-0 lg:grid-cols-6">
        {popularCategories.map((c) => {
          const Icon = ICONS[c.icon ?? ''] ?? Tag;
          return (
            <Link key={c.id} href={`/categoria/${c.slug}`} className="card group flex min-w-36 shrink-0 items-center gap-3 p-4 transition-shadow hover:shadow-lift">
              <span className="grid size-10 place-items-center rounded-xl bg-subtle text-ink-2 transition-colors group-hover:bg-ink group-hover:text-on-ink"><Icon className="size-5" /></span>
              <span><span className="block text-sm font-medium">{c.name}</span><span className="text-xs text-muted">{c.count} productos</span></span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
function CategoriesSkeleton() {
  return <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[72px] rounded-xl" />)}</div>;
}

function Section({ title, href, icon, children }: { title: string; href: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-14">
      <div className="mb-4 flex items-end justify-between gap-4">
        <h2 className="flex items-center gap-2 text-xl font-semibold">{icon}{title}</h2>
        <Link href={href} className="group flex items-center gap-1 text-sm font-medium text-muted hover:text-ink">Ver todo <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" /></Link>
      </div>
      <Suspense fallback={<ProductGridSkeleton count={5} />}>{children}</Suspense>
    </section>
  );
}

async function Rail({ pick, count = 5 }: { pick: 'offers' | 'bestSellers' | 'featured' | 'topRated' | 'newest'; count?: number }) {
  const items = (await sections())[pick].slice(0, count);
  if (!items.length) return <p className="text-sm text-muted">Pronto habrá productos aquí.</p>;
  return <ProductGrid items={items} priorityCount={pick === 'offers' ? 5 : 0} />;
}

async function Recommended() {
  const user = await getCurrentUser();
  if (!user) return null;
  const ids = await recommendedFor(user.id);
  const items: ProductCard[] = await getProductsByIds(ids);
  if (items.length < 4) return null;
  return (
    <section className="mt-14">
      <div className="mb-4"><h2 className="text-xl font-semibold">Recomendados para ti</h2><p className="text-sm text-muted">Según tus compras y favoritos.</p></div>
      <ProductGrid items={items.slice(0, 5)} />
    </section>
  );
}

async function FeaturedStores() {
  const { featuredStores } = await sections();
  if (!featuredStores.length) return null;
  return (
    <section className="mt-16">
      <div className="mb-4 flex items-end justify-between"><h2 className="text-xl font-semibold">Tiendas destacadas</h2></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {featuredStores.map((s) => (
          <Link key={s.id} href={`/tienda/${s.slug}`} className="card group overflow-hidden transition-shadow hover:shadow-lift">
            <div className="relative h-28 bg-subtle">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {s.bannerUrl && <img src={s.bannerUrl} alt="" loading="lazy" className="size-full object-cover" />}
            </div>
            <div className="flex items-start gap-3 p-4">
              <div className="-mt-10 grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-surface text-lg font-semibold shadow-card ring-4 ring-surface">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {s.logoUrl ? <img src={s.logoUrl} alt="" className="size-full object-cover" /> : s.name[0]}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><span className="truncate font-medium group-hover:underline">{s.name}</span></div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  {s.ratingCount > 0 && <span className="flex items-center gap-1"><Stars value={Number(s.ratingAvg)} size={11} /> {Number(s.ratingAvg).toFixed(1)}</span>}
                  <span>{s.salesCount} ventas</span>
                  <span>{s.productCount} productos</span>
                  {s.city && <span>{s.city}</span>}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function SellCta() {
  return (
    <section className="mt-20 grid items-center gap-8 overflow-hidden rounded-2xl border border-line bg-surface p-8 sm:p-12 lg:grid-cols-2">
      <div>
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-brand"><StoreIcon className="size-4" /> Vende en {APP_NAME}</span>
        <h2 className="mt-3 text-3xl font-semibold">Abre tu tienda gratis y llega a compradores de todo el país.</h2>
        <p className="mt-3 text-muted">Sin mensualidades: solo pagas una comisión cuando vendes. Publica en minutos, administra pedidos y recibe reseñas verificadas.</p>
        <div className="mt-6 flex gap-3"><ButtonLink href="/vender" size="lg">Empezar a vender</ButtonLink><ButtonLink href="/ayuda/comisiones" variant="secondary" size="lg">Ver comisiones</ButtonLink></div>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {[['Tu propia tienda', 'Página pública con tu marca, productos y reseñas.'], ['Panel de ventas', 'Pedidos, inventario y estadísticas en un solo lugar.'], ['Pagos protegidos', 'Cobramos por ti con Stripe o Mercado Pago.'], ['Cupones y ofertas', 'Crea promociones para vender más.']].map(([t, d]) => (
          <li key={t} className="rounded-xl bg-subtle p-4"><div className="text-sm font-medium">{t}</div><div className="mt-1 text-[13px] text-muted">{d}</div></li>
        ))}
      </ul>
      <p className="text-xs text-muted lg:col-span-2">Las tiendas y productos marcados con <DemoBadge /> son datos de demostración del entorno de desarrollo.</p>
    </section>
  );
}
