import type { APIRoute } from 'astro';
import { adminCookie, clearAdminCookie, createAdminToken, verifyAdminCredentials } from '../../../lib/admin';
import { bad, json, readBody } from '../../../lib/http';
import { rateLimitRequest } from '../../../lib/security';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const limited = rateLimitRequest(request, 'auth:admin', 8, 15 * 60_000);
  if (limited) return bad(limited, 429);

  const body = await readBody<{ email?: string; password?: string }>(request);
  const email = String(body.email || '').trim();
  const password = String(body.password || '');

  if (!verifyAdminCredentials(email, password)) {
    return bad('Credenciales inválidas', 401);
  }

  return json({ ok: true }, 200, { 'Set-Cookie': adminCookie(createAdminToken()) });
};

export const DELETE: APIRoute = async () => {
  return json({ ok: true }, 200, { 'Set-Cookie': clearAdminCookie() });
};
