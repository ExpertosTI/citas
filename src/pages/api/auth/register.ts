import type { APIRoute } from 'astro';
import { createSessionToken, sessionCookie } from '../../../lib/auth';
import { bad, json, readBody } from '../../../lib/http';
import { sendWelcomeEmail } from '../../../lib/mail';
import { createTenant, safeTenant } from '../../../lib/store';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
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
  if (password.length < 6) return bad('La contraseña debe tener al menos 6 caracteres');

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
    if (msg === 'email_taken') return bad('Ese email ya está registrado', 409);
    return bad('No se pudo crear la cuenta', 500);
  }
};
