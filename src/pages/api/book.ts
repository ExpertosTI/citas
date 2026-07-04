import type { APIRoute } from 'astro';
import { bad, json, readBody } from '../../lib/http';
import { sendAppointmentNotifications } from '../../lib/mail';
import {
  createAppointment,
  findOrCreateClient,
  getServices,
  getTenantBySlug,
  publicTenant,
} from '../../lib/store';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug') || '';
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return bad('Salón no encontrado', 404);
  const services = (await getServices(tenant.id)).filter((s) => s.active);
  return json({ ok: true, tenant: publicTenant(tenant), services });
};

export const POST: APIRoute = async ({ request }) => {
  const body = await readBody<{
    slug?: string;
    serviceId?: string;
    startAt?: string;
    name?: string;
    email?: string;
    phone?: string;
    notes?: string;
  }>(request);

  const slug = String(body.slug || '').trim();
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return bad('Salón no encontrado', 404);

  const name = String(body.name || '').trim();
  if (name.length < 2) return bad('Nombre requerido');
  if (!body.serviceId || !body.startAt) return bad('Servicio y horario requeridos');

  try {
    const client = await findOrCreateClient(tenant.id, {
      name,
      email: body.email,
      phone: body.phone,
    });

    const appointment = await createAppointment(tenant.id, {
      clientId: client.id,
      serviceId: body.serviceId,
      startAt: body.startAt,
      notes: body.notes,
      status: 'confirmed',
      source: 'public',
    });

    const services = await getServices(tenant.id);
    const service = services.find((s) => s.id === appointment.serviceId);
    if (service) {
      sendAppointmentNotifications({
        tenant,
        client,
        service,
        appointment,
        kind: 'created',
      }).catch(() => {});
    }

    return json({ ok: true, appointment: { id: appointment.id, startAt: appointment.startAt, endAt: appointment.endAt } }, 201);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error';
    if (msg === 'slot_taken') return bad('Ese horario ya no está disponible', 409);
    return bad('No se pudo reservar', 500);
  }
};
