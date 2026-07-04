import type { APIRoute } from 'astro';
import { tenantIdFromRequest } from '../../../lib/auth';
import { bad, json } from '../../../lib/http';
import { getClientHistory, getWaitlist, removeWaitlistEntry } from '../../../lib/store';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const tenantId = tenantIdFromRequest(request);
  if (!tenantId) return bad('No autenticado', 401);
  const list = await getWaitlist(tenantId);
  return json({ ok: true, waitlist: list });
};

export const DELETE: APIRoute = async ({ request }) => {
  const tenantId = tenantIdFromRequest(request);
  if (!tenantId) return bad('No autenticado', 401);
  const url = new URL(request.url);
  const id = url.searchParams.get('id') || '';
  if (!id) return bad('id requerido');
  await removeWaitlistEntry(tenantId, id);
  return json({ ok: true });
};
