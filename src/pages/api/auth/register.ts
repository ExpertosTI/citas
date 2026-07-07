import type { APIRoute } from 'astro';
import { createSessionToken, sessionCookie } from '../../../lib/auth';
import { bad, json, readBody } from '../../../lib/http';
import { rateLimitRequest, sessionSecretIssue } from '../../../lib/security';
import { sendWelcomeEmail } from '../../../lib/mail';
import { createTenant, safeTenant } from '../../../lib/store';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const limited = rateLimitRequest(request, 'auth:register', 5, 60 * 60_000);
  if (limited) return bad(limited, 429);

  const body = await readBody<{
    businessName?: string;
    ownerName?: string;
    email?: string;
    password?: string;
    phone?: string;
    city?: string;
    country?: string;
    slug?: string;
  }>(request);

  const businessName = String(body.businessName || '').trim();
  const ownerName = String(body.ownerName || '').trim();
  const email = String(body.email || '').trim();
  const password = String(body.password || '');

  if (businessName.length < 2) return bad('Indica el nombre del local');
  if (ownerName.length < 2) return bad('Indica tu nombre');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad('Email inválido');
  if (password.length < 8) return bad('La contraseña debe tener al menos 8 caracteres');

  if (sessionSecretIssue()) {
    console.error('[auth/register] SESSION_SECRET missing or weak');
    return bad('El servidor no está listo para nuevas cuentas. Intenta más tarde.', 503);
  }

  try {
    const tenant = await createTenant({
      businessName,
      ownerName,
      email,
      password,
      phone: body.phone,
      city: body.city,
      country: body.country,
      slug: body.slug,
    });

    sendWelcomeEmail(tenant).catch(() => {});

    const token = createSessionToken(tenant.id);
    return json(
      { ok: true, tenant: safeTenant(tenant) },
      201,
      { 'Set-Cookie': sessionCookie(token) },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error';
    console.error('[auth/register]', msg, err);
    if (msg === 'email_taken') {
      return bad('Ese email ya está registrado. Inicia sesión o usa otro correo.', 409);
    }
    return bad('No se pudo crear la cuenta', 500);
  }
};
