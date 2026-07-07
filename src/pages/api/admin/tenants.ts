import type { APIRoute } from 'astro';
import { isAdminRequest } from '../../../lib/admin';
import { bad, json } from '../../../lib/http';
import { catalogForTenant } from '../../../lib/modules/tenant-modules';
import { subscriptionLabel } from '../../../lib/subscription';
import { getServices, getTenants, safeTenant } from '../../../lib/store';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  if (!isAdminRequest(request)) return bad('No autorizado', 401);

  const tenants = await getTenants();
  const rows = await Promise.all(
    tenants.map(async (t) => {
      const safe = safeTenant(t);
      const services = await getServices(t.id);
      return {
        id: t.id,
        businessName: safe.businessName,
        ownerName: safe.ownerName,
        email: t.email,
        slug: safe.slug,
        city: safe.city,
        country: safe.country,
        phone: safe.phone,
        onboardingComplete: safe.onboardingComplete !== false,
        servicesCount: services.length,
        createdAt: t.createdAt,
        publicUrl: `/s/${safe.slug}`,
        modules: catalogForTenant(t).map((m) => ({
          id: m.id,
          label: m.label,
          icon: m.icon,
          enabled: m.enabled,
          required: Boolean(m.required),
        })),
        subscription: safe.subscription,
        subscriptionLabel: subscriptionLabel(safe.subscription!),
      };
    }),
  );

  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return json({ ok: true, tenants: rows, total: rows.length });
};
