import type { APIRoute } from 'astro';
import { tenantIdFromRequest } from '../../../lib/auth';
import { bad, json, readBody } from '../../../lib/http';
import { sendAppointmentNotifications } from '../../../lib/mail';
import {
  createAppointment,
  findOrCreateClient,
  getAppointments,
  getBoardDay,
  getClients,
  getServices,
  getTenantById,
} from '../../../lib/store';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const tenantId = tenantIdFromRequest(request);
  if (!tenantId) return bad('No autenticado', 401);

  const url = new URL(request.url);
  const date = url.searchParams.get('date');
  if (date) {
    const board = await getBoardDay(tenantId, date);
    return json({ ok: true, ...board });
  }

  const from = url.searchParams.get('from') || undefined;
  const to = url.searchParams.get('to') || undefined;
  const appointments = await getAppointments(tenantId, from, to);
  return json({ ok: true, appointments });
};

export const POST: APIRoute = async ({ request }) => {
  const tenantId = tenantIdFromRequest(request);
  if (!tenantId) return bad('No autenticado', 401);

  const body = await readBody<{
    clientId?: string;
    clientName?: string;
    clientEmail?: string;
    clientPhone?: string;
    serviceId?: string;
    startAt?: string;
    notes?: string;
    color?: string;
    status?: string;
    notify?: boolean;
  }>(request);

  try {
    let clientId = body.clientId;
    if (!clientId) {
      if (!body.clientName) return bad('Cliente requerido');
      const client = await findOrCreateClient(tenantId, {
        name: body.clientName,
        email: body.clientEmail,
        phone: body.clientPhone,
      });
      clientId = client.id;
    }

    if (!body.serviceId || !body.startAt) return bad('Servicio y horario requeridos');

    const appointment = await createAppointment(tenantId, {
      clientId,
      serviceId: body.serviceId,
      startAt: body.startAt,
      notes: body.notes,
      color: body.color as never,
      status: (body.status as never) || 'confirmed',
      source: 'dashboard',
    });

    if (body.notify !== false) {
      const [tenant, clients, services] = await Promise.all([
        getTenantById(tenantId),
        getClients(tenantId),
        getServices(tenantId),
      ]);
      const client = clients.find((c) => c.id === appointment.clientId);
      const service = services.find((s) => s.id === appointment.serviceId);
      if (tenant && client && service) {
        sendAppointmentNotifications({
          tenant,
          client,
          service,
          appointment,
          kind: 'created',
        }).catch(() => {});
      }
    }

    return json({ ok: true, appointment }, 201);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error';
    if (msg === 'slot_taken') return bad('Ese horario ya está ocupado', 409);
    if (msg === 'service_not_found') return bad('Servicio no encontrado', 404);
    if (msg === 'client_not_found') return bad('Cliente no encontrado', 404);
    return bad('No se pudo crear la cita', 500);
  }
};
