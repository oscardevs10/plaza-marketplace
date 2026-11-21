import type { NextConfig } from 'next';

// Cabeceras de seguridad para todas las respuestas.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(self)' },
  ...(process.env.NODE_ENV === 'production' ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }] : []),
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // PGlite carga su WASM desde node_modules en tiempo de ejecución; sharp usa binarios nativos.
  serverExternalPackages: ['@electric-sql/pglite', 'sharp'],
  // storage.ts arma rutas de archivos en tiempo de ejecución; esto evita empaquetar carpetas que el servidor no usa.
  outputFileTracingExcludes: { '/*': ['.data/**', 'scripts/**', 'docs/**', 'tests/**', '.playwright-mcp/**', '*.md'] },
  experimental: {
    serverActions: { bodySizeLimit: '40mb' }, // hasta 10 fotos por producto; cada una se valida por separado (8 MB)
  },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'images.unsplash.com' }],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      '*.css': { loaders: ['@tailwindcss/turbopack'], as: '*.css' },
    },
  },
};

export default nextConfig;
