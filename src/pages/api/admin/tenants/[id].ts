import type { APIRoute } from 'astro';
import { isAdminRequest } from '../../../../lib/admin';
import { bad, json, readBody } from '../../../../lib/http';
import { catalogForTenant, setTenantModule } from '../../../../lib/modules/tenant-modules';
import { normalizeSubscription, type SubscriptionPlan, type SubscriptionStatus } from '../../../../lib/subscription';
import { getTenantById, safeTenant, updateTenant } from '../../../../lib/store';

export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  if (!isAdminRequest(request)) return bad('No autorizado', 401);

  const id = params.id || '';
  const tenant = await getTenantById(id);
  if (!tenant) return bad('Negocio no encontrado', 404);

  const safe = safeTenant(tenant);
  return json({
    ok: true,
    tenant: {
      id: tenant.id,
      businessName: safe.businessName,
      email: tenant.email,
      slug: safe.slug,
      modules: catalogForTenant(tenant),
      subscription: safe.subscription,
    },
  });
};

export const PATCH: APIRoute = async ({ params, request }) => {
  if (!isAdminRequest(request)) return bad('No autorizado', 401);

  const id = params.id || '';
  const tenant = await getTenantById(id);
  if (!tenant) return bad('Negocio no encontrado', 404);

  const body = await readBody<{
    modules?: { moduleId?: string; enabled?: boolean }[];
    subscription?: {
      plan?: SubscriptionPlan;
      status?: SubscriptionStatus;
      renewsAt?: string;
      notes?: string;
    };
  }>(request);

  if (Array.isArray(body.modules)) {
    for (const entry of body.modules) {
      const moduleId = String(entry.moduleId || '').trim();
      if (!moduleId) continue;
      try {
        await setTenantModule(id, moduleId, entry.enabled === true, updateTenant, getTenantById);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'error';
        if (msg === 'module_required') continue;
        if (msg === 'module_unknown') return bad('Módulo desconocido', 404);
        return bad('No se pudo actualizar módulo', 500);
      }
    }
  }

  if (body.subscription && typeof body.subscription === 'object') {
    const current = normalizeSubscription(tenant.subscription, tenant.createdAt);
    const next = normalizeSubscription(
      {
        ...current,
        plan: body.subscription.plan ?? current.plan,
        status: body.subscription.status ?? current.status,
        renewsAt: body.subscription.renewsAt ?? current.renewsAt,
        notes: body.subscription.notes ?? current.notes,
      },
      tenant.createdAt,
    );
    await updateTenant(id, { subscription: next } as never);
  }

  const updated = await getTenantById(id);
  if (!updated) return bad('Negocio no encontrado', 404);

  const safe = safeTenant(updated);
  return json({
    ok: true,
    tenant: {
      id: updated.id,
      businessName: safe.businessName,
      modules: catalogForTenant(updated),
      subscription: safe.subscription,
    },
  });
};
