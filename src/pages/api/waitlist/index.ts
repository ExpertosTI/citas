import type { APIRoute } from 'astro';
import { bad, json, readBody } from '../../../lib/http';
import { rateLimitRequest } from '../../../lib/security';
import { addWaitlistEntry, getTenantBySlug } from '../../../lib/store';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const limited = rateLimitRequest(request, 'public:waitlist', 12, 60 * 60_000);
  if (limited) return bad(limited, 429);

  const body = await readBody<{
    slug?: string;
    serviceId?: string;
    preferredDate?: string;
    name?: string;
    phone?: string;
    email?: string;
    notes?: string;
  }>(request);

  const slug = String(body.slug || '').trim();
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return bad('Local no encontrado', 404);

  const name = String(body.name || '').trim();
  if (name.length < 2 || !body.serviceId || !body.preferredDate) {
    return bad('Datos incompletos', 400);
  }

  const entry = await addWaitlistEntry(tenant.id, {
    clientName: name,
    clientPhone: body.phone,
    clientEmail: body.email,
    serviceId: body.serviceId,
    preferredDate: body.preferredDate,
    notes: body.notes,
  });

  return json({ ok: true, entry }, 201);
};
