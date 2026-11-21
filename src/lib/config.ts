export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'Plaza';
// En Vercel, si no defines NEXT_PUBLIC_APP_URL se usa el dominio de producción que Vercel asigna.
export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL
  ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3005')).replace(/\/$/, '');
export const IS_PROD = process.env.NODE_ENV === 'production';
export const CURRENCY = 'MXN';
export const LOCALE = 'es-MX';

/**
 * Confirmar el correo antes de comprar o vender solo tiene sentido si los correos realmente salen.
 * Por defecto se exige cuando hay servicio de correo (RESEND_API_KEY); se puede forzar con REQUIRE_VERIFIED_EMAIL.
 */
export const REQUIRE_VERIFIED_EMAIL = process.env.REQUIRE_VERIFIED_EMAIL ? process.env.REQUIRE_VERIFIED_EMAIL === 'true' : !!(process.env.RESEND_API_KEY || (process.env.SMTP_USER && process.env.SMTP_PASS));
export const needsEmailCheck = (u: { emailVerified: boolean }) => REQUIRE_VERIFIED_EMAIL && !u.emailVerified;

export const LIMITS = {
  productImages: 10,
  reviewImages: 4,
  imageBytes: 8 * 1024 * 1024,
  variants: 50,
  cartQty: 99,
  pageSize: 24,
} as const;
