import type { APIRoute } from 'astro';
import { tenantIdFromRequest } from '../../../../lib/auth';
import { bad, json } from '../../../../lib/http';
import { getClientHistory } from '../../../../lib/store';

export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
  const tenantId = tenantIdFromRequest(request);
  if (!tenantId) return bad('No autenticado', 401);
  const data = await getClientHistory(tenantId, params.id || '');
  if (!data) return bad('Cliente no encontrado', 404);
  return json({ ok: true, ...data });
};
