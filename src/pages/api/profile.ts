import type { APIRoute } from 'astro';
import { tenantIdFromRequest } from '../../lib/auth';
import { bad, json, readBody } from '../../lib/http';
import { getTenantById, safeTenant, updateTenant } from '../../lib/store';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const tenantId = tenantIdFromRequest(request);
  if (!tenantId) return bad('No autenticado', 401);
  const tenant = await getTenantById(tenantId);
  if (!tenant) return bad('Sesión inválida', 401);
  return json({ ok: true, tenant: safeTenant(tenant) });
};

export const PUT: APIRoute = async ({ request }) => {
  const tenantId = tenantIdFromRequest(request);
  if (!tenantId) return bad('No autenticado', 401);

  const body = await readBody<Record<string, unknown>>(request);
  const allowed = [
    'businessName',
    'ownerName',
    'phone',
    'address',
    'city',
    'bio',
    'accentColor',
    'slug',
    'openHour',
    'closeHour',
  ] as const;

  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) patch[key] = body[key];
  }

  if (patch.openHour !== undefined) patch.openHour = Number(patch.openHour);
  if (patch.closeHour !== undefined) patch.closeHour = Number(patch.closeHour);

  try {
    const tenant = await updateTenant(tenantId, patch as never);
    if (!tenant) return bad('No encontrado', 404);
    return json({ ok: true, tenant: safeTenant(tenant) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error';
    if (msg === 'slug_taken') return bad('Ese enlace ya está en uso', 409);
    if (msg === 'email_taken') return bad('Email en uso', 409);
    return bad('No se pudo guardar', 500);
  }
};
