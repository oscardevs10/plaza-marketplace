import 'server-only';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import nodemailer, { type Transporter } from 'nodemailer';
import { APP_NAME, APP_URL } from '@/lib/config';

/**
 * Todo correo pasa por la tabla email_outbox (registro y reintentos). Proveedores, en este orden:
 * - SMTP (p. ej. Gmail con contraseña de aplicación): SMTP_USER + SMTP_PASS (+ SMTP_HOST/SMTP_PORT, por defecto Gmail).
 * - Resend: RESEND_API_KEY + EMAIL_FROM (requiere dominio propio verificado para enviar a cualquiera).
 * Sin ninguno, el correo queda "capturado" y se ve en /dev/correos (solo desarrollo).
 */
export async function sendEmail(to: string, subject: string, html: string) {
  const [row] = await db.insert(schema.emailOutbox).values({ to, subject, html }).returning({ id: schema.emailOutbox.id });
  const mark = (v: Partial<typeof schema.emailOutbox.$inferInsert>) => db.update(schema.emailOutbox).set(v).where(eq(schema.emailOutbox.id, row.id));
  try {
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      const info = await smtp().sendMail({ from: process.env.EMAIL_FROM || `${APP_NAME} <${process.env.SMTP_USER}>`, to, subject, html });
      await mark({ status: 'sent', providerId: info.messageId, sentAt: new Date() });
    } else if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, html }),
        signal: AbortSignal.timeout(10_000),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      await mark(res.ok ? { status: 'sent', providerId: data.id ?? null, sentAt: new Date() } : { status: 'failed', error: data.message ?? String(res.status) });
    } else {
      await mark({ status: 'captured' });
    }
  } catch (e) {
    await mark({ status: 'failed', error: String(e).slice(0, 500) });
  }
}

let transport: Transporter | undefined;
function smtp() {
  const port = Number(process.env.SMTP_PORT ?? 465);
  return (transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com', port, secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
  }));
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Plantilla base: HTML sencillo con estilos en línea (lo que mejor soportan los clientes de correo). */
export function emailLayout(opts: { title: string; intro: string; cta?: { label: string; href: string }; footer?: string }) {
  const href = opts.cta && (opts.cta.href.startsWith('http') ? opts.cta.href : APP_URL + opts.cta.href);
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#18181b">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px">
    <div style="font-weight:700;font-size:20px;margin-bottom:24px">${escapeHtml(APP_NAME)}</div>
    <div style="background:#fff;border:1px solid #e4e4e7;border-radius:14px;padding:28px">
      <h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(opts.title)}</h1>
      <p style="font-size:15px;line-height:1.6;color:#3f3f46;margin:0 0 20px">${escapeHtml(opts.intro)}</p>
      ${href ? `<a href="${escapeHtml(href)}" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;font-size:14px">${escapeHtml(opts.cta!.label)}</a>` : ''}
    </div>
    <p style="font-size:12px;color:#71717a;margin-top:20px">${escapeHtml(opts.footer ?? `Recibiste este correo porque tienes una cuenta en ${APP_NAME}.`)}</p>
  </div></body></html>`;
}
