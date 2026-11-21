import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import { Geist, Geist_Mono } from 'next/font/google';
import { APP_NAME, APP_URL, IS_PROD } from '@/lib/config';
import { Header } from '@/components/site/header';
import { Footer } from '@/components/site/footer';
import { MobileNav } from '@/components/site/mobile-nav';
import { ImageShrinker } from '@/components/image-shrinker';
import { Toaster } from '@/components/toaster';
import { CartDrawer } from '@/components/cart/cart-drawer';
import { FavoritesProvider } from '@/components/community/favorites';
import { THEME_SCRIPT } from '@/components/theme-toggle';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: { default: `${APP_NAME} · Compra y vende en México`, template: `%s · ${APP_NAME}` },
  description: 'Marketplace con miles de productos de tiendas independientes. Compra protegida, reseñas verificadas y envíos a todo México.',
  applicationName: APP_NAME,
  openGraph: { type: 'website', siteName: APP_NAME, locale: 'es_MX' },
  twitter: { card: 'summary_large_image' },
};

export const viewport: Viewport = {
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#ffffff' }, { media: '(prefers-color-scheme: dark)', color: '#0b0b0e' }],
  width: 'device-width', initialScale: 1, viewportFit: 'cover',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    // suppressHydrationWarning: el script del tema agrega data-theme antes de que React hidrate.
    <html lang="es-MX" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-dvh flex-col pb-[calc(60px+env(safe-area-inset-bottom))] md:pb-0">
        <a href="#contenido" className="sr-only z-50 rounded-md bg-ink px-3 py-2 text-on-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2">Saltar al contenido</a>
        {IS_PROD && process.env.ENABLE_SANDBOX_PAYMENTS === 'true' && (
          <div className="bg-warning-soft px-4 py-1.5 text-center text-xs font-medium text-warning">Sitio de demostración: los pagos son de prueba (Sandbox) y no se cobra nada.</div>
        )}
        <FavoritesProvider>
          <Header />
          <div id="contenido" className="flex-1">{children}</div>
          <Footer />
        </FavoritesProvider>
        <Suspense fallback={<div className="fixed inset-x-0 bottom-0 h-[calc(60px+env(safe-area-inset-bottom))] border-t border-line bg-surface md:hidden" />}>
          <MobileNav />
        </Suspense>
        <CartDrawer />
        <Toaster />
        <ImageShrinker />
      </body>
    </html>
  );
}
