import type { APIRoute } from 'astro';
import { tenantIdFromRequest } from '../../../lib/auth';
import { bad, json, readBody } from '../../../lib/http';
import { sendAppointmentNotifications } from '../../../lib/mail';
import {
  getAppointment,
  getClients,
  getServices,
  getTenantById,
  updateAppointment,
} from '../../../lib/store';
import { zonedDateTime } from '../../../lib/tz';

export const prerender = false;

export const PATCH: APIRoute = async ({ request, params }) => {
  const tenantId = tenantIdFromRequest(request);
  if (!tenantId) return bad('No autenticado', 401);

  const id = params.id || '';
  const body = await readBody<{
    status?: string;
    notes?: string;
    color?: string;
    startAt?: string;
    aptDate?: string;
    aptTime?: string;
    cancelReason?: string;
    notify?: boolean;
  }>(request);

  const tenant = await getTenantById(tenantId);
  if (!tenant) return bad('Sesión inválida', 401);

  let startAt = body.startAt;
  if (body.aptDate && body.aptTime) {
    startAt = zonedDateTime(body.aptDate, body.aptTime, tenant.timezone).toISOString();
  }

  const appointment = await updateAppointment(tenantId, id, {
    status: body.status as never,
    notes: body.notes,
    color: body.color as never,
    startAt,
    cancelReason: body.cancelReason,
  });

  if (!appointment) return bad('Cita no encontrada', 404);

  if (body.status === 'cancelled' && body.notify !== false) {
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
        kind: 'cancelled',
      }).catch(() => {});
    }
  }

  if (body.status === 'confirmed' && body.notify !== false) {
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
        kind: 'confirmed',
      }).catch(() => {});
    }
  }

  return json({ ok: true, appointment });
};

export const GET: APIRoute = async ({ request, params }) => {
  const tenantId = tenantIdFromRequest(request);
  if (!tenantId) return bad('No autenticado', 401);
  const appointment = await getAppointment(tenantId, params.id || '');
  if (!appointment) return bad('Cita no encontrada', 404);
  return json({ ok: true, appointment });
};
