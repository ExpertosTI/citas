import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import type { Appointment, Client, Service, Tenant } from './store';
import { cutStyleLabel } from './cut-styles';
import { sanitizeEmailSubject } from './security';
import { sendPlatformWhatsApp, sendWhatsAppMessage } from './whatsapp';

function env(name: string, fallback = '') {
  const raw = process.env[name] ?? fallback;
  return String(raw).trim().replace(/^["']|["']$/g, '');
}

function mailEnv() {
  return {
    user: env('SMTP_USER', 'info@renace.tech'),
    pass: env('SMTP_PASS'),
    host: env('SMTP_HOST', 'smtp.hostinger.com'),
    port: Number(env('SMTP_PORT', '465')) || 465,
    admin: env('ADMIN_EMAIL', 'info@renace.tech'),
    fromName: env('SMTP_FROM_NAME', 'Citas · Renace'),
    siteUrl: env('PUBLIC_SITE_URL', 'https://citas.renace.tech').replace(/\/$/, ''),
    replyTo: env('SMTP_REPLY_TO', 'info@renace.tech'),
  };
}

function mailConfigured() {
  const { pass } = mailEnv();
  if (!pass) return { ok: false as const, reason: 'SMTP_PASS is empty' };
  if (/TU_APP_PASSWORD|YOUR_GOOGLE|changeme|xxx/i.test(pass)) {
    return { ok: false as const, reason: 'SMTP_PASS is still a placeholder' };
  }
  return { ok: true as const };
}

function createTransport() {
  const cfg = mailConfigured();
  if (!cfg.ok) {
    console.warn('[mail]', cfg.reason);
    return null;
  }
  const m = mailEnv();
  const options: SMTPTransport.Options = {
    host: m.host,
    port: m.port,
    secure: m.port === 465,
    requireTLS: m.port === 587,
    auth: { user: m.user, pass: m.pass },
    tls: { minVersion: 'TLSv1.2' },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  };
  return nodemailer.createTransport(options);
}

function escapeHtml(s: string) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatWhen(iso: string) {
  return new Intl.DateTimeFormat('es', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function wrap(title: string, body: string, brand = 'Citas') {
  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#f5f5f4">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0a0a0a;padding:28px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#141414;border-radius:12px;border:1px solid #2a2a2a;overflow:hidden">
        <tr><td style="padding:28px 28px 12px;text-align:center;background:#1c1c1c">
          <p style="margin:0;font-size:22px;font-weight:800;color:#e8b923;letter-spacing:0.06em;text-transform:uppercase">${escapeHtml(brand)}</p>
          <p style="margin:6px 0 0;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#78716c;font-weight:700">Citas · Renace</p>
        </td></tr>
        <tr><td style="padding:8px 28px 28px">
          <h1 style="margin:0 0 14px;font-size:22px;line-height:1.25;color:#f5f5f4;font-weight:700">${escapeHtml(title)}</h1>
          ${body}
        </td></tr>
        <tr><td style="padding:16px 28px 24px;border-top:1px solid #2a2a2a;text-align:center">
          <p style="margin:0;font-size:12px;color:#78716c">Powered by <a href="https://citas.renace.tech" style="color:#e8b923;text-decoration:none;font-weight:600">citas.renace.tech</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function explainSmtpError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  if (/Invalid login|BadCredentials|535|Authentication failed/i.test(msg)) {
    return 'SMTP authentication failed.';
  }
  if (/ECONNECTION|ETIMEDOUT|ENOTFOUND/i.test(msg)) {
    return 'Could not reach SMTP server.';
  }
  return 'Mail delivery failed.';
}

export function getMailConfigStatus() {
  const cfg = mailConfigured();
  return { configured: cfg.ok, reason: cfg.ok ? undefined : 'Mail is not configured.' };
}

async function send(to: string, subject: string, html: string, replyTo?: string) {
  const transport = createTransport();
  const m = mailEnv();
  if (!transport) return { ok: false as const, error: 'smtp_not_configured' };
  const safeSubject = sanitizeEmailSubject(subject);
  try {
    await transport.sendMail({
      from: `"${m.fromName}" <${m.user}>`,
      replyTo: replyTo || m.replyTo,
      to,
      subject: safeSubject,
      html,
    });
    return { ok: true as const };
  } catch (err) {
    console.error('[mail]', explainSmtpError(err));
    return { ok: false as const, error: explainSmtpError(err) };
  }
}

export async function sendWelcomeEmail(tenant: Tenant) {
  const m = mailEnv();
  const html = wrap(
    'Tu salón ya está listo',
    `<p style="color:#4a3548;line-height:1.55">Hola ${escapeHtml(tenant.ownerName)},</p>
     <p style="color:#4a3548;line-height:1.55">Bienvenido a <strong>Citas</strong>. Tu perfil <strong>${escapeHtml(tenant.businessName)}</strong> ya puede recibir reservas.</p>
     <p style="margin:16px 0;padding:12px 14px;border-radius:8px;background:#1c1c1c;border:1px solid #2a2a2a;font-weight:700;color:#e8b923">
       Página pública: ${escapeHtml(m.siteUrl)}/s/${escapeHtml(tenant.slug)}
     </p>
     <p style="text-align:center;margin:22px 0 8px">
       <a href="${m.siteUrl}/app" style="display:inline-block;background:linear-gradient(135deg,#e8b923,#c9970a);color:#0a0a0a;text-decoration:none;font-weight:700;font-size:13px;padding:12px 22px;border-radius:8px">Abrir bahía de citas</a>
     </p>`,
    tenant.businessName,
  );
  return send(tenant.email, `Bienvenido a Citas · ${tenant.businessName}`, html);
}

function formatWhenShort(iso: string, timezone = 'America/Santo_Domingo') {
  return new Intl.DateTimeFormat('es', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  }).format(new Date(iso));
}

function buildWhatsAppTexts(opts: {
  tenant: Tenant;
  client: Client;
  service: Service;
  appointment: Appointment;
  kind: 'created' | 'pending' | 'confirmed' | 'reminder' | 'cancelled';
}) {
  const { tenant, client, service, appointment, kind } = opts;
  const when = formatWhenShort(appointment.startAt, tenant.timezone);
  const code = appointment.code || '—';

  const clientBodies = {
    created: `Hola ${client.name}, tu cita en *${tenant.businessName}* quedó agendada.\n📅 ${when}\n✂️ ${service.name}\nCódigo: ${code}`,
    pending: `Hola ${client.name}, recibimos tu solicitud en *${tenant.businessName}*.\n📅 ${when}\n✂️ ${service.name}\nTe confirmaremos pronto.`,
    confirmed: `Hola ${client.name}, tu cita en *${tenant.businessName}* fue *confirmada*.\n📅 ${when}\n✂️ ${service.name}\nCódigo: ${code}`,
    reminder: `Hola ${client.name}, recordatorio de tu cita en *${tenant.businessName}*.\n📅 ${when}\n✂️ ${service.name}`,
    cancelled: `Hola ${client.name}, tu cita en *${tenant.businessName}* fue cancelada.\n📅 ${when}\nPuedes reservar otro horario cuando quieras.`,
  };

  const ownerBodies = {
    created: `🆕 *Nueva reserva* — ${tenant.businessName}\n👤 ${client.name}\n📅 ${when}\n✂️ ${service.name}\nCódigo: ${code}`,
    pending: `🆕 *Nueva solicitud* — ${tenant.businessName}\n👤 ${client.name}\n📅 ${when}\n✂️ ${service.name}\nRevisa tu bahía para confirmar.`,
    confirmed: `✅ Cita confirmada — ${client.name}\n📅 ${when}\n✂️ ${service.name}`,
    reminder: `⏰ Recordatorio — ${client.name}\n📅 ${when}\n✂️ ${service.name}`,
    cancelled: `❌ Cita cancelada — ${client.name}\n📅 ${when}\n✂️ ${service.name}`,
  };

  return { client: clientBodies[kind], owner: ownerBodies[kind] };
}

async function sendAppointmentWhatsApp(opts: {
  tenant: Tenant;
  client: Client;
  service: Service;
  appointment: Appointment;
  kind: 'created' | 'pending' | 'confirmed' | 'reminder' | 'cancelled';
}) {
  const { tenant, client, kind } = opts;
  const country = tenant.country || 'DO';
  const texts = buildWhatsAppTexts(opts);
  const results = { client: false, owner: false, platform: false };

  if (client.phone) {
    const r = await sendWhatsAppMessage(client.phone, texts.client, country);
    results.client = r.ok;
  }

  const ownerPhone = tenant.whatsapp || tenant.phone;
  if (ownerPhone) {
    const r = await sendWhatsAppMessage(ownerPhone, texts.owner, country);
    results.owner = r.ok;
  }

  if (kind === 'pending' || kind === 'created') {
    const r = await sendPlatformWhatsApp(`🆕 Citas · ${tenant.businessName}\n${texts.owner}`);
    results.platform = r.ok;
  }

  return results;
}

export async function sendAppointmentNotifications(opts: {
  tenant: Tenant;
  client: Client;
  service: Service;
  appointment: Appointment;
  kind: 'created' | 'pending' | 'confirmed' | 'reminder' | 'cancelled';
}) {
  const { tenant, client, service, appointment, kind } = opts;
  const when = formatWhen(appointment.startAt);
  const titles = {
    created: 'Cita confirmada',
    pending: 'Solicitud de cita',
    confirmed: 'Cita confirmada',
    reminder: 'Recordatorio de cita',
    cancelled: 'Cita cancelada',
  };
  const bodies = {
    created: 'Tu cita quedó agendada. Te esperamos.',
    pending: 'Recibimos tu solicitud. Te confirmaremos pronto.',
    confirmed: 'Tu cita fue confirmada. Te esperamos.',
    reminder: 'Te recordamos tu cita próxima. ¡Nos vemos pronto!',
    cancelled: 'Tu cita fue cancelada. Puedes reservar otro horario cuando quieras.',
  };

  const details = `
    <table style="border-collapse:collapse;width:100%;margin:12px 0">
      <tr><td style="padding:8px 0;color:#9a7b6a;font-size:13px">Salón</td><td style="padding:8px 0;font-weight:700">${escapeHtml(tenant.businessName)}</td></tr>
      <tr><td style="padding:8px 0;color:#9a7b6a;font-size:13px">Estilo</td><td style="padding:8px 0;font-weight:700">${escapeHtml(cutStyleLabel(appointment.haircutStyle || '') || appointment.notes?.split(' · ')[0] || '—')}</td></tr>
      <tr><td style="padding:8px 0;color:#9a7b6a;font-size:13px">Servicio</td><td style="padding:8px 0;font-weight:700">${escapeHtml(service.name)}</td></tr>
      <tr><td style="padding:8px 0;color:#9a7b6a;font-size:13px">Código</td><td style="padding:8px 0;font-weight:700">${escapeHtml(appointment.code || '—')}</td></tr>
      <tr><td style="padding:8px 0;color:#9a7b6a;font-size:13px">Cuándo</td><td style="padding:8px 0;font-weight:700">${escapeHtml(when)}</td></tr>
      <tr><td style="padding:8px 0;color:#9a7b6a;font-size:13px">Cliente</td><td style="padding:8px 0;font-weight:700">${escapeHtml(client.name)}</td></tr>
    </table>`;

  const clientHtml = wrap(
    titles[kind],
    `<p style="color:#4a3548;line-height:1.55">Hola ${escapeHtml(client.name)},</p>
     <p style="color:#4a3548;line-height:1.55">${bodies[kind]}</p>
     ${details}
     ${tenant.phone ? `<p style="color:#9a7b6a;font-size:13px">Contacto: ${escapeHtml(tenant.phone)}</p>` : ''}`,
    tenant.businessName,
  );

  const ownerHtml = wrap(
    kind === 'created' || kind === 'pending' ? 'Nueva cita' : titles[kind],
    `<p style="color:#4a3548;line-height:1.55">${
      kind === 'pending'
        ? 'Nueva solicitud de reserva — revisa y acepta en tu bahía.'
        : kind === 'created'
          ? 'Recibiste una nueva reserva.'
          : bodies[kind]
    }</p>
     ${details}`,
    tenant.businessName,
  );

  const results = { client: false, owner: false };

  if (client.email && kind !== 'pending') {
    const r = await send(client.email, `${titles[kind]} · ${tenant.businessName}`, clientHtml, tenant.email);
    results.client = r.ok;
  } else if (client.email && kind === 'pending') {
    const r = await send(
      client.email,
      `Solicitud recibida · ${tenant.businessName}`,
      clientHtml,
      tenant.email,
    );
    results.client = r.ok;
  }

  const r2 = await send(tenant.email, `${titles[kind]}: ${client.name} · ${service.name}`, ownerHtml, client.email || undefined);
  results.owner = r2.ok;

  const wa = await sendAppointmentWhatsApp(opts).catch(() => ({
    client: false,
    owner: false,
    platform: false,
  }));

  return { ...results, whatsapp: wa };
}

export async function processDueReminders() {
  const { getTenants, getAppointments, getClients, getServices, updateAppointment } = await import('./store');
  const tenants = await getTenants();
  const now = Date.now();
  const windowMs = 24 * 60 * 60 * 1000;
  let sent = 0;
  let checked = 0;

  for (const tenant of tenants) {
    const appointments = await getAppointments(tenant.id);
    const clients = await getClients(tenant.id);
    const services = await getServices(tenant.id);

    for (const apt of appointments) {
      checked += 1;
      if (apt.reminderSentAt || apt.status === 'cancelled' || apt.status === 'completed' || apt.status === 'invoiced') continue;
      const when = new Date(apt.startAt).getTime();
      if (!Number.isFinite(when) || when < now || when > now + windowMs) continue;

      const client = clients.find((c) => c.id === apt.clientId);
      const service = services.find((s) => s.id === apt.serviceId);
      if (!client || !service) continue;

      const result = await sendAppointmentNotifications({
        tenant,
        client,
        service,
        appointment: apt,
        kind: 'reminder',
      });

      if (result.client || result.owner || result.whatsapp?.client || result.whatsapp?.owner) {
        await updateAppointment(tenant.id, apt.id, { reminderSentAt: new Date().toISOString() });
        sent += 1;
      }
    }
  }

  return { checked, sent };
}
