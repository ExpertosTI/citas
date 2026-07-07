import { isGoogleAuthConfigured } from './google-auth';

function env(name: string, fallback = '') {
  const raw = process.env[name] ?? fallback;
  return String(raw).trim().replace(/^["']|["']$/g, '');
}

function smtpOk() {
  const pass = env('SMTP_PASS');
  if (!pass) return false;
  return !/TU_APP_PASSWORD|YOUR_GOOGLE|changeme|xxx/i.test(pass);
}

function sessionOk() {
  const s = env('SESSION_SECRET');
  if (!s || s.length < 24) return false;
  return !/change-me|citas-change-me|citas-dev/i.test(s);
}

export type EnvCheck = {
  ok: boolean;
  label: string;
  detail?: string;
};

export function collectEnvStatus() {
  const smtp: EnvCheck = {
    ok: smtpOk(),
    label: 'smtp',
    detail: smtpOk()
      ? `${env('SMTP_HOST', 'smtp.hostinger.com')}:${env('SMTP_PORT', '465')} · ${env('SMTP_USER', 'info@renace.tech')}`
      : 'SMTP_PASS vacío o placeholder',
  };

  const gemini: EnvCheck = {
    ok: Boolean(env('GEMINI_API_KEY')),
    label: 'gemini',
    detail: env('GEMINI_API_KEY') ? env('GEMINI_MODEL', 'gemini-2.5-flash') : 'GEMINI_API_KEY vacío',
  };

  const google: EnvCheck = {
    ok: isGoogleAuthConfigured(),
    label: 'google',
    detail: isGoogleAuthConfigured() ? 'OAuth configurado' : 'GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET vacío',
  };

  const session: EnvCheck = {
    ok: sessionOk(),
    label: 'session',
    detail: sessionOk() ? 'SESSION_SECRET válido' : 'SESSION_SECRET débil o ausente',
  };

  const reminder: EnvCheck = {
    ok: Boolean(env('REMINDER_SECRET') || env('SESSION_SECRET')),
    label: 'reminder',
    detail: env('REMINDER_SECRET') ? 'REMINDER_SECRET propio' : 'usa SESSION_SECRET',
  };

  const site: EnvCheck = {
    ok: Boolean(env('PUBLIC_SITE_URL', 'https://citas.renace.tech')),
    label: 'site',
    detail: env('PUBLIC_SITE_URL', 'https://citas.renace.tech'),
  };

  const checks = [smtp, gemini, google, session, reminder, site];
  return {
    ok: checks.every((c) => c.ok),
    checks,
    mailFrom: env('SMTP_FROM_NAME', 'Citas · Renace'),
    replyTo: env('SMTP_REPLY_TO', 'info@renace.tech'),
    adminEmail: env('ADMIN_EMAIL', 'info@renace.tech'),
  };
}
