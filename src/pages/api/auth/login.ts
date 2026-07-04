import type { APIRoute } from 'astro';
import { createSessionToken, sessionCookie, verifyPassword } from '../../../lib/auth';
import { bad, json, readBody } from '../../../lib/http';
import { getTenantByEmail, safeTenant } from '../../../lib/store';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const body = await readBody<{ email?: string; password?: string }>(request);
  const email = String(body.email || '').trim();
  const password = String(body.password || '');

  if (!email || !password) return bad('Email y contraseña requeridos');

  const tenant = await getTenantByEmail(email);
  if (!tenant || !verifyPassword(password, tenant.passwordHash)) {
    return bad('Credenciales incorrectas', 401);
  }

  const token = createSessionToken(tenant.id);
  return json({ ok: true, tenant: safeTenant(tenant) }, 200, {
    'Set-Cookie': sessionCookie(token),
  });
};
