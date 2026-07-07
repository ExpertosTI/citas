import type { APIRoute } from 'astro';
import { tenantIdFromRequest } from '../../../lib/auth';
import { bad, json, readBody } from '../../../lib/http';
import { deleteService, getServices, saveService } from '../../../lib/store';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const tenantId = tenantIdFromRequest(request);
  if (!tenantId) return bad('No autenticado', 401);
  const services = await getServices(tenantId);
  return json({ ok: true, services });
};

export const POST: APIRoute = async ({ request }) => {
  const tenantId = tenantIdFromRequest(request);
  if (!tenantId) return bad('No autenticado', 401);
  const body = await readBody<{
    id?: string;
    name?: string;
    durationMin?: number;
    price?: number;
    pricingMode?: 'fixed' | 'quote';
    color?: string;
    active?: boolean;
  }>(request);

  if (!String(body.name || '').trim()) return bad('Nombre requerido');

  const service = await saveService(tenantId, {
    id: body.id,
    name: String(body.name),
    durationMin: body.durationMin,
    price: body.price,
    pricingMode: body.pricingMode === 'quote' ? 'quote' : 'fixed',
    color: body.color as never,
    active: body.active,
  });

  return json({ ok: true, service }, body.id ? 200 : 201);
};

export const DELETE: APIRoute = async ({ request }) => {
  const tenantId = tenantIdFromRequest(request);
  if (!tenantId) return bad('No autenticado', 401);
  const url = new URL(request.url);
  const id = url.searchParams.get('id') || '';
  if (!id) return bad('id requerido');
  await deleteService(tenantId, id);
  return json({ ok: true });
};
