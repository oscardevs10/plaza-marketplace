# Arquitectura

## Decisiones técnicas

| Capa | Elección | Motivo |
|---|---|---|
| Aplicación | Next.js 16 (App Router, Server Components, Server Actions) + TypeScript | Un solo proyecto para interfaz y servidor; páginas renderizadas en servidor para SEO; Server Actions con verificación de origen (CSRF) incluida |
| Renderizado | Cache Components: cada página es un "shell" estático + datos en streaming | Carga inicial instantánea y esqueletos de carga; precios y existencias siempre frescos (`requestData()`) |
| Estilos | Tailwind CSS 4 con tokens en `src/app/globals.css` | Sistema de diseño único (colores semánticos, sombras, radios, animaciones) |
| Base de datos | PostgreSQL + Drizzle ORM, migraciones SQL en `/drizzle` | Relacional, transacciones, búsqueda de texto en español, consultas parametrizadas |
| BD local | PGlite (Postgres 18 en WASM) | Desarrollo sin instalar nada; misma SQL que producción |
| Autenticación | Propia: sesiones en BD, cookie `HttpOnly`, scrypt | Control total de roles; sin dependencia externa |
| Imágenes | sharp + almacenamiento local (driver intercambiable) | Re-codificación a WebP, sin metadatos, dos tamaños |
| Pagos | Interfaz `PaymentProvider` con Sandbox, Stripe y Mercado Pago (REST, sin SDK) | Agregar un proveedor = implementar 5 métodos |
| Correo | Bandeja `email_outbox` + Gmail (SMTP) o Resend | Registro de cada envío; buzón local en desarrollo |
| Hosting sugerido | Vercel + Neon + Cloudflare R2 + Resend | Todos con plan gratuito |

## Estructura

```
src/
  app/                 rutas (tienda, cuenta, vendedor, admin, api)
  actions/             Server Actions por área (auth, shop, account, seller, admin)
  components/          ui/ (sistema de diseño), product/, catalog/, site/, seller/, admin/…
  lib/
    db/                esquema, cliente (PGlite o Postgres), migraciones
    auth/              sesión y guardas de acceso (requireUser/Seller/Admin)
    services/          reglas de negocio: catalog, cart, pricing, orders, reviews, community, seller/, admin/
    payments/          proveedores de pago
    security.ts        límite de intentos y auditoría
    storage.ts         validación y guardado de imágenes
    email.ts, notifications.ts
scripts/               migrate, seed, reset
tests/                 pruebas (vitest)
```

## Usuarios y roles

Un usuario tiene uno o varios roles (`buyer`, `seller`, `admin`) en `user_roles`. Al crear su tienda se le agrega `seller`; no hay cuentas duplicadas. Cada página protegida y cada acción vuelve a verificar permisos; las consultas del vendedor siempre se filtran por el `store_id` de su sesión.

## Modelo de datos (36 tablas)

- **Acceso:** users, roles, user_roles, sessions (id = SHA-256 del token), auth_tokens (verificación y recuperación, un solo uso)
- **Vendedores:** seller_profiles, stores, store_followers
- **Catálogo:** categories (2 niveles), products (columna `search_vector` generada, índices GIN de texto y trigramas), product_images, product_variants (existencias, `CHECK stock >= 0`), inventory_movements (bitácora)
- **Compra:** carts (usuario o invitado), cart_items, addresses, coupons (por tienda)
- **Pedidos:** orders (pedido principal, dirección congelada), seller_orders (uno por tienda: envío, cupón, comisión, neto del vendedor, estado de liquidación), order_items (copia de título y precio)
- **Pagos:** payments, payment_transactions (índice único por evento del proveedor), platform_commissions (global + por categoría)
- **Envíos:** shipments, shipment_events
- **Reseñas:** reviews (una por persona y producto; ligada al artículo comprado), review_images, review_responses, review_votes
- **Comunidad y sistema:** favorites, reports, notifications, email_outbox, audit_logs, rate_limits, platform_settings

Dinero en centavos; comisiones en puntos base. "Discounts" se cubre con el precio de oferta del producto y los cupones; "Inventory" con las existencias por variante más su bitácora.

## Flujo de compra y pagos

1. El carrito agrupa por tienda; precios, existencias, envío y cupones se calculan en el servidor (`services/pricing.ts`, funciones puras y probadas).
2. `placeOrder` en una transacción: bloquea las variantes (`FOR UPDATE`), revalida todo, descuenta existencias, aplica cupones, calcula comisión por categoría y crea el pedido principal con un sub-pedido por tienda. El pedido queda apartado 60 minutos.
3. Se crea el pago con el proveedor elegido y se redirige a su página.
4. Confirmación por **webhook**: se verifica la firma, se consulta el estado real al proveedor, el evento se registra una sola vez (idempotencia) y se valida que monto y moneda coincidan. Solo entonces el pedido pasa a pagado y se notifica a comprador y tiendas.
5. Pedidos no pagados a tiempo se cancelan y liberan existencias (`/api/cron/expirar-pedidos`).
6. El dinero del vendedor queda **retenido** (`payout_status`): pasa a "elegible" al entregarse, pero no se libera sin un mecanismo real de liquidación (pendiente: Stripe Connect o Mercado Pago Marketplace).
7. Reembolsos totales desde el panel de administración, vía el proveedor.

**Sandbox:** proveedor de pruebas interno, claramente marcado, que emite eventos firmados y sigue exactamente el mismo camino que un webhook real. Activo en desarrollo; apagado en producción salvo `ENABLE_SANDBOX_PAYMENTS=true`.

## Reseñas verificadas

Solo con un artículo de un sub-pedido **entregado** que pertenezca a la persona; una reseña por producto y persona (índice único). Los promedios se recalculan desde la fuente en la misma transacción. Votos "útil" uno por persona (no la propia), respuesta pública del vendedor, reportes y moderación por el administrador.

## Seguridad

- Contraseñas con scrypt (N=2¹⁵, r=8, p=3) y sal; comparación en tiempo constante; mismo tiempo de respuesta exista o no la cuenta.
- Sesiones en BD (se guarda el hash del token), cookie `HttpOnly`, `SameSite=Lax`, `Secure` y prefijo `__Host-` en producción; cambiar o recuperar contraseña cierra las demás sesiones.
- Límite de intentos en BD para registro, inicio de sesión (por IP y por cuenta), recuperación, compras, reseñas, reportes y carrito.
- CSRF: Server Actions verifican el origen; webhooks verifican firma HMAC.
- SQL injection: todas las consultas parametrizadas (Drizzle); los comodines de búsqueda se escapan.
- XSS: React escapa todo; JSON-LD escapa `<`; el buzón de desarrollo usa iframe sin scripts.
- Imágenes: tipo detectado por contenido, máximo 8 MB y 50 MP, re-codificadas (sin EXIF/GPS).
- Redirecciones solo a rutas internas (`?next=`).
- Cabeceras: `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS en producción.
- Auditoría de acciones sensibles en `audit_logs`; la dirección del comprador solo se muestra al vendedor cuando el pedido está pagado.

## Experiencia de compra

- **Modo oscuro:** los mismos tokens de color con otros valores (`globals.css`). Sigue al sistema o se fija con el botón de tema (se guarda en el navegador; un script en `<head>` lo aplica antes de pintar, sin destello).
- **Celular:** barra inferior (Inicio, Categorías, Buscar, Carrito, Cuenta), hoja de categorías y barra fija de compra en la página de producto.
- **Carrito lateral** al agregar productos, **avisos breves** (toasts) para confirmaciones, **corazón de favoritos** en cada tarjeta (los favoritos se cargan una vez por visita), **vistos recientemente** (en el navegador) y **visor de fotos** a pantalla completa con zoom y deslizamiento.
- **Preguntas al vendedor:** públicas una vez respondidas; se bloquean correos y teléfonos para que las compras no salgan de la plataforma (y de la compra protegida). La tienda responde u oculta desde `/vendedor/preguntas`.

## Caché

Las lecturas públicas del catálogo (`services/catalog.ts`) usan `"use cache"` con la etiqueta `catalog` y se renuevan cada minuto. Cualquier cambio que afecte lo que ve un comprador (guardar producto, existencias, pedidos y pagos —incluidos webhooks—, reseñas, seguidores, moderación) llama a `invalidateCatalog()` (`lib/cache.ts`), así la siguiente visita ya ve el dato nuevo. Lo personal (sesión, carrito, favoritos) nunca se cachea.

## SEO

URLs amigables (`/producto/slug`, `/tienda/slug`, `/categoria/slug`), metadatos y Open Graph por página, URL canónica, `sitemap.xml` dinámico, `robots.txt`, datos estructurados `Product` (+ `AggregateRating`, `Offer`) y `Store`, búsquedas libres con `noindex`.

## Verificado

- `tsc`, `eslint` y `next build` sin errores; 20 pruebas automáticas.
- Recorrido completo en navegador: registro → verificación de correo → compra con dos tiendas y cupón → pago Sandbox → el vendedor prepara y envía → el comprador confirma → reseña verificada con foto.
- Aislamiento: un vendedor no puede abrir pedidos de otra tienda (404); un vendedor no entra al panel de administración; sin sesión, las áreas privadas redirigen a iniciar sesión.

## Pendiente (para la siguiente etapa)

- **Stripe y Mercado Pago no se han probado con credenciales reales**: el código sigue su documentación oficial, pero hay que hacer una compra de prueba en su modo test antes de lanzar.
- Liquidación a vendedores (Stripe Connect / Mercado Pago Marketplace) y conciliación.
- Driver de almacenamiento S3/R2 para desplegar en serverless.
- Integración con paqueterías mexicanas (Envia.com, Skydropx): la tabla `shipments` y los eventos ya están preparados.
- Facturación CFDI, cancelación parcial por tienda, mensajería privada comprador-vendedor.
- Los textos legales son plantillas: revisarlos con un abogado.
