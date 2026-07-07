import type { OnboardingAiResponse } from './onboarding-ai';
import { parseHourToken } from './schedule-parser';
import { isAppointmentBookingRequest, toCard } from './assistant-queries';
import {
  createAppointment,
  findOrCreateClient,
  getServices,
  getTenantById,
} from './store';
import { localMinutes, localParts, tenantTimezone, zonedDateTime } from './tz';

function normalize(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function parseClientName(text: string) {
  const n = normalize(text);
  const patterns = [
    /(?:para|de|cliente|con)\s+([a-záéíóúñ][a-záéíóúñ\s]{1,40}?)(?:\s+(?:para|manana|mañana|hoy|a las|el|la|cita)|$)/i,
    /cita\s+(?:para|de)\s+([a-záéíóúñ][a-záéíóúñ\s]{1,40}?)(?:\s+(?:manana|mañana|hoy|a las)|$)/i,
  ];
  for (const re of patterns) {
    const m = n.match(re);
    if (m?.[1]) {
      const name = m[1].replace(/\s+(para|manana|mañana|hoy|a las).*$/i, '').trim();
      if (name.length >= 2 && !/^(una|un|el|la|las|los|manana|mañana|hoy|cita)$/i.test(name)) {
        return name.replace(/\b\w/g, (c) => c.toUpperCase());
      }
    }
  }
  return null;
}

function parseServiceName(text: string) {
  const n = normalize(text);
  const m = n.match(
    /(?:servicio|de|para)\s+(corte|barba|tinte|color|pies|manicure|pedicure|cejas|facial|secado|alisado|mechas)[a-z\s]*/i,
  );
  return m?.[1] || null;
}

function resolveBookingStart(text: string, tz: string): Date | null {
  const n = normalize(text);

  let dayOffset: number | null = null;
  if (/pasado\s*manana|pasado\s*mañana/.test(n)) dayOffset = 2;
  else if (/manana|mañana/.test(n)) dayOffset = 1;
  else if (/hoy/.test(n)) dayOffset = 0;

  let hour: number | null = null;
  let minute = 0;

  const aLas = n.match(/(?:a\s+)?las\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.?m\.?|p\.?m\.?)?/);
  if (aLas) {
    hour = parseHourToken(`${aLas[1]}${aLas[2] ? `:${aLas[2]}` : ''}${aLas[3] || ''}`);
    minute = aLas[2] ? Number(aLas[2]) : 0;
  }

  const atTime = n.match(/\b(\d{1,2}):(\d{2})\b/);
  if (hour == null && atTime) {
    hour = parseHourToken(`${atTime[1]}:${atTime[2]}`);
    minute = Number(atTime[2]);
  }

  const plainHour = n.match(/\ba las (\d{1,2})\b/);
  if (hour == null && plainHour) {
    hour = parseHourToken(plainHour[1]);
  }

  if (hour == null) return null;

  const now = localParts(Date.now(), tz);
  const base = new Date(Date.UTC(now.year, now.month - 1, now.day + (dayOffset ?? 0)));
  const y = base.getUTCFullYear();
  const mo = base.getUTCMonth() + 1;
  const d = base.getUTCDate();
  const dateStr = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  let start = zonedDateTime(dateStr, timeStr, tz);
  if (start.getTime() <= Date.now()) {
    const next = new Date(Date.UTC(y, mo - 1, d + 1));
    const nextDate = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
    start = zonedDateTime(nextDate, timeStr, tz);
  }

  return start;
}

function formatWhen(iso: string, tz: string) {
  return new Intl.DateTimeFormat('es', {
    timeZone: tz,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export async function bookAppointmentFromText(
  tenantId: string,
  text: string,
): Promise<OnboardingAiResponse | null> {
  if (!isAppointmentBookingRequest(text)) return null;

  const tenant = await getTenantById(tenantId);
  if (!tenant) return { reply: 'No encontré tu negocio. Recarga e intenta de nuevo.', readyToApply: false };

  const services = (await getServices(tenantId)).filter((s) => s.active);
  if (!services.length) {
    return {
      reply: 'Primero configura al menos un servicio en **Servicios**, y luego podré agendar citas.',
      readyToApply: false,
    };
  }

  const tz = tenantTimezone(tenant);
  const start = resolveBookingStart(text, tz);
  if (!start) {
    return {
      reply: 'Para agendar dime el día y la hora. Ej: **"Cita para mañana a las 10"** o **"Agendar a Juan mañana 3pm"**.',
      readyToApply: false,
    };
  }

  const open = tenant.openHour ?? 9;
  const close = tenant.closeHour ?? 20;
  const startMin = localMinutes(start.toISOString(), tz);
  const startHour = startMin / 60;
  if (startHour < open || startHour >= close) {
    return {
      reply: `Ese horario queda fuera del local (${open}:00 – ${close}:00). Elige otra hora dentro del horario.`,
      readyToApply: false,
    };
  }

  const serviceHint = parseServiceName(text);
  const service =
    (serviceHint
      ? services.find((s) => normalize(s.name).includes(normalize(serviceHint)))
      : null) || services[0];

  const clientName = parseClientName(text) || 'Cliente';
  const client = await findOrCreateClient(tenantId, { name: clientName });

  try {
    const appointment = await createAppointment(tenantId, {
      clientId: client.id,
      serviceId: service.id,
      startAt: start.toISOString(),
      status: 'confirmed',
      source: 'dashboard',
    });

    const card = toCard(appointment, [client], services);
    const when = formatWhen(appointment.startAt, tz);

    return {
      reply: `Listo — agendé **${service.name}** para **${clientName}** el **${when}**.`,
      cards: [card],
      readyToApply: false,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error';
    if (msg === 'slot_taken') {
      return {
        reply: `Ese horario (${formatWhen(start.toISOString(), tz)}) ya está ocupado. Prueba otra hora o revisa la bahía.`,
        readyToApply: false,
      };
    }
    console.error('[assistant/book]', msg, err);
    return {
      reply: 'No pude crear la cita. Revisa la bahía e intenta con otro horario.',
      readyToApply: false,
    };
  }
}
