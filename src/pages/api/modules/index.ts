import type { APIRoute } from 'astro';
import { tenantIdFromRequest } from '../../../lib/auth';
import { bad, json, readBody } from '../../../lib/http';
import { catalogForTenant, setTenantModule } from '../../../lib/modules/tenant-modules';
import { getTenantById, updateTenant } from '../../../lib/store';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const tenantId = tenantIdFromRequest(request);
  if (!tenantId) return bad('No autenticado', 401);

  const tenant = await getTenantById(tenantId);
  if (!tenant) return bad('Sesión inválida', 401);

  return json({ ok: true, modules: catalogForTenant(tenant) });
};

export const POST: APIRoute = async ({ request }) => {
  const tenantId = tenantIdFromRequest(request);
  if (!tenantId) return bad('No autenticado', 401);

  const body = await readBody<{ moduleId?: string; enabled?: boolean }>(request);
  const moduleId = String(body.moduleId || '').trim();
  if (!moduleId) return bad('moduleId requerido', 400);

  try {
    const updated = await setTenantModule(
      tenantId,
      moduleId,
      body.enabled === true,
      updateTenant,
      getTenantById,
    );
    return json({ ok: true, modules: catalogForTenant(updated) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error';
    if (msg === 'module_unknown') return bad('Módulo desconocido', 404);
    if (msg === 'module_required') return bad('Este módulo es obligatorio', 400);
    return bad('No se pudo actualizar', 500);
  }
};
