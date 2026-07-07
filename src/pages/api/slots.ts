import type { APIRoute } from 'astro';
import { bad, json } from '../../lib/http';
import { generateAvailableSlots } from '../../lib/slots';
import { getAppointments, getServices, getTenantBySlug } from '../../lib/store';
import { dayBoundsUtc } from '../../lib/tz';

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

  const day = date.slice(0, 10);
  const { from, to } = dayBoundsUtc(day, tenant.timezone);
  const appointments = await getAppointments(tenant.id, from, to);

  const slots = generateAvailableSlots(tenant, service, day, appointments);
  return json({ ok: true, slots, closed: slots.length === 0 });
};
