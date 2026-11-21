# Plaza — Marketplace multivendedor

**Sitio publicado:** https://plaza-marketplace-beta.vercel.app

Marketplace donde cualquier persona crea una cuenta, compra, y con la misma cuenta abre su tienda y vende. Incluye panel de vendedor, panel de administración, pagos (Stripe, Mercado Pago y un entorno Sandbox), reseñas verificadas, envíos con seguimiento y notificaciones.

## Arrancar en local

Requisitos: Node.js 22.13 o más nuevo. No necesitas instalar una base de datos.

```bash
npm install
npm run db:seed     # crea la base local y los datos de demostración
npm run dev         # http://localhost:3005
```

Cuentas de demostración (contraseña `Demo12345!`):

| Rol | Correo |
|---|---|
| Administración | admin@plaza.dev |
| Vendedores | mariana@demo.dev · andres@demo.dev · valeria@demo.dev · rodrigo@demo.dev |
| Compradores | lucia@demo.dev · diego@demo.dev · sofia@demo.dev |

- Los correos (verificación, recuperación de contraseña, avisos de pedidos) se ven en **http://localhost:3005/dev/correos** mientras no configures Resend.
- Los pagos usan el **Sandbox**: una pantalla marcada como prueba donde apruebas o rechazas el pago. No se cobra nada.
- Las tiendas y productos de demostración llevan la etiqueta **DEMO**.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo (puerto 3005) |
| `npm run build` / `npm start` | Compilación y servidor de producción |
| `npm test` | Pruebas (precios, cupones, comisiones, contraseñas, restricciones de la base) |
| `npm run typecheck` · `npm run lint` | Verificación de tipos y estilo |
| `npm run db:generate` | Genera una migración después de cambiar `src/lib/db/schema.ts` |
| `npm run db:migrate` | Aplica migraciones pendientes |
| `npm run db:seed` | Datos de demostración (se niega a correr en producción) |
| `npm run db:reset` | Borra la base local y la vuelve a crear con datos de demostración |

> La base local (PGlite) solo admite un proceso a la vez: detén `npm run dev` antes de `db:seed` o `db:reset`.

## Publicar gratis (Vercel + Neon)

1. En [vercel.com](https://vercel.com) entra con tu cuenta de GitHub → **Add New → Project** → importa este repositorio. **No le des "Deploy" todavía.**
2. En **Environment Variables** agrega:
   | Variable | Valor |
   |---|---|
   | `ADMIN_EMAIL` | tu correo (al registrarte con él serás administrador) |
   | `ENABLE_SANDBOX_PAYMENTS` | `true` (pagos de prueba mientras no conectes Stripe o Mercado Pago) |
   | `SANDBOX_SECRET` | una cadena larga aleatoria |
   | `CRON_SECRET` | otra cadena larga aleatoria |
3. Da **Deploy**. Fallará la primera vez porque aún no hay base de datos; es normal.
4. En el proyecto → **Storage → Create Database → Neon** (plan gratis) → conéctala al proyecto. Esto crea `DATABASE_URL` sola.
5. **Deployments → ⋯ → Redeploy.** Al compilar se aplican las migraciones y se crean las categorías (`npm run vercel-build`).
6. Abre tu URL `*.vercel.app`, regístrate con tu `ADMIN_EMAIL` y listo.

Notas:
- Las fotos se guardan en la misma base de datos (no hay disco en Vercel). El plan gratis de Neon (0.5 GB) alcanza para unas 3,000 fotos.
- Sin Resend no se envían correos: la confirmación de correo deja de ser obligatoria y no funciona "recuperar contraseña". Para activarlos agrega `RESEND_API_KEY` y `EMAIL_FROM`.
- Para cobrar de verdad agrega las llaves de Stripe o Mercado Pago (ver `.env.example`) y quita `ENABLE_SANDBOX_PAYMENTS`.
- Cada `git push` a `main` publica una nueva versión.

## Documentación

- [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) — decisiones técnicas, módulos, modelo de datos, pagos, seguridad y pendientes.
- [docs/CONVENCIONES.md](docs/CONVENCIONES.md) — reglas para agregar código (Next.js 16, seguridad, UI).
