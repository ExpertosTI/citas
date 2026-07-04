import type { APIRoute } from 'astro';
import { bad, json } from '../../lib/http';
import { generateAvailableSlots } from '../../lib/slots';
import { getAppointments, getServices, getTenantBySlug } from '../../lib/store';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug') || '';
  const date = url.searchParams.get('date') || '';
  const serviceId = url.searchParams.get('serviceId') || '';

  if (!slug || !date || !serviceId) return bad('slug, date y serviceId requeridos');

  const tenant = await getTenantBySlug(slug);
  if (!tenant) return bad('Local no encontrado', 404);

  const services = await getServices(tenant.id);
  const service = services.find((s) => s.id === serviceId && s.active);
  if (!service) return bad('Servicio no encontrado', 404);

  const dayStart = new Date(`${date.slice(0, 10)}T00:00:00`);
  const dayEnd = new Date(`${date.slice(0, 10)}T23:59:59`);
  const appointments = await getAppointments(
    tenant.id,
    new Date(dayStart.getTime() - 12 * 3600_000).toISOString(),
    new Date(dayEnd.getTime() + 12 * 3600_000).toISOString(),
  );

  const slots = generateAvailableSlots(tenant, service, date.slice(0, 10), appointments);
  return json({ ok: true, slots, closed: slots.length === 0 });
};
