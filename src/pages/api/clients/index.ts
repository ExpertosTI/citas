import type { APIRoute } from 'astro';
import { tenantIdFromRequest } from '../../../lib/auth';
import { bad, json, readBody } from '../../../lib/http';
import { getClients, saveClient } from '../../../lib/store';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const tenantId = tenantIdFromRequest(request);
  if (!tenantId) return bad('No autenticado', 401);
  const clients = await getClients(tenantId);
  return json({ ok: true, clients });
};

export const POST: APIRoute = async ({ request }) => {
  const tenantId = tenantIdFromRequest(request);
  if (!tenantId) return bad('No autenticado', 401);
  const body = await readBody<{
    id?: string;
    name?: string;
    email?: string;
    phone?: string;
    notes?: string;
  }>(request);

  if (!String(body.name || '').trim()) return bad('Nombre requerido');

  const client = await saveClient(tenantId, {
    id: body.id,
    name: String(body.name),
    email: body.email,
    phone: body.phone,
    notes: body.notes,
  });

  return json({ ok: true, client }, body.id ? 200 : 201);
};
