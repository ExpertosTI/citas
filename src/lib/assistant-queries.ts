import { statusLabel } from './appointment-status';
import type { AssistantAppointmentCard, OnboardingAiResponse } from './onboarding-ai';
import { getAppointments, getClients, getServices } from './store';

function normalizeIntent(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function isAppointmentBookingRequest(text: string) {
  const n = normalizeIntent(text);
  return (
    /agendar|agendame|agendeme|agende|agenede|agend[ae]|reservar|reservame|res[eé]rva(r|me)/.test(n) ||
    /(crear|poner|pon|hacer|hazme|nueva|programar|marcar)\s+(una\s+)?cita/.test(n) ||
    /quiero\s+(que\s+.*\s+)?(agendar|agende|reservar|programar)/.test(n) ||
    (/cita/.test(n) &&
      /(manana|mañana|hoy|pasado|a las \d|las \d|\d:\d{2}|\d{1,2}\s*(am|pm))/i.test(n))
  );
}

function localDate(iso: string) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatWhen(iso: string) {
  return new Intl.DateTimeFormat('es', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function isAppointmentQuery(text: string) {
  if (isAppointmentBookingRequest(text)) return false;
  return /cita|citas|pendiente|pendientes|agenda|hoy|pr[oó]xim|reserva|reservas|horario|bah[ií]a|confirmar|cu[aá]ntas|tengo|hay|dime|lista|mostrar|ver/i.test(
    text,
  );
}

export function toCard(
  a: Awaited<ReturnType<typeof getAppointments>>[0],
  clients: Awaited<ReturnType<typeof getClients>>,
  services: Awaited<ReturnType<typeof getServices>>,
): AssistantAppointmentCard {
  const client = clients.find((c) => c.id === a.clientId);
  const service = services.find((s) => s.id === a.serviceId);
  return {
    id: a.id,
    clientName: client?.name || 'Cliente',
    serviceName: service?.name || 'Servicio',
    when: formatWhen(a.startAt),
    status: a.status,
    statusLabel: statusLabel(a.status),
    code: a.code || '',
    date: localDate(a.startAt),
    pending: a.status === 'pending',
  };
}

function cardsResponse(reply: string, list: AssistantAppointmentCard[]): OnboardingAiResponse {
  return { reply, cards: list, readyToApply: false };
}

export async function answerAppointmentQuery(
  tenantId: string,
  text: string,
): Promise<OnboardingAiResponse | null> {
  const n = text.toLowerCase();
  if (!isAppointmentQuery(text)) return null;

  const [appointments, clients, services] = await Promise.all([
    getAppointments(tenantId),
    getClients(tenantId),
    getServices(tenantId),
  ]);

  if (/pendiente/.test(n)) {
    const pending = appointments
      .filter((a) => a.status === 'pending')
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
    if (!pending.length) {
      return { reply: 'No tienes citas pendientes. Todo al día.', readyToApply: false };
    }
    const cards = pending.map((a) => toCard(a, clients, services));
    return cardsResponse(
      `Tienes ${pending.length} cita${pending.length === 1 ? '' : 's'} pendiente${pending.length === 1 ? '' : 's'}:`,
      cards,
    );
  }

  if (/hoy/.test(n)) {
    const today = localDate(new Date().toISOString());
    const todayAppts = appointments
      .filter((a) => localDate(a.startAt) === today && a.status !== 'cancelled')
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
    if (!todayAppts.length) {
      return { reply: 'No hay citas agendadas para hoy.', readyToApply: false };
    }
    return cardsResponse(
      `Hoy tienes ${todayAppts.length} cita${todayAppts.length === 1 ? '' : 's'}:`,
      todayAppts.map((a) => toCard(a, clients, services)),
    );
  }

  if (/pr[oó]xim|siguiente|futur/.test(n)) {
    const upcoming = appointments
      .filter((a) => a.status !== 'cancelled' && new Date(a.startAt).getTime() >= Date.now())
      .sort((a, b) => a.startAt.localeCompare(b.startAt))
      .slice(0, 8);
    if (!upcoming.length) {
      return { reply: 'No hay citas próximas en la agenda.', readyToApply: false };
    }
    return cardsResponse('Próximas citas:', upcoming.map((a) => toCard(a, clients, services)));
  }

  if (/cu[aá]ntas|total|resumen|estado/.test(n)) {
    const pending = appointments.filter((a) => a.status === 'pending').length;
    const today = localDate(new Date().toISOString());
    const todayN = appointments.filter(
      (a) => localDate(a.startAt) === today && a.status !== 'cancelled',
    ).length;
    const upcoming = appointments.filter(
      (a) => a.status !== 'cancelled' && new Date(a.startAt).getTime() >= Date.now(),
    ).length;
    return {
      reply: `Resumen:\n· Pendientes: ${pending}\n· Hoy: ${todayN}\n· Próximas: ${upcoming}`,
      readyToApply: false,
    };
  }

  if (/cita|agenda|reserva/.test(n)) {
    const pending = appointments.filter((a) => a.status === 'pending');
    if (pending.length) {
      return cardsResponse(
        `${pending.length} pendiente${pending.length === 1 ? '' : 's'}:`,
        pending.map((a) => toCard(a, clients, services)),
      );
    }
    const upcoming = appointments
      .filter((a) => a.status !== 'cancelled' && new Date(a.startAt).getTime() >= Date.now())
      .sort((a, b) => a.startAt.localeCompare(b.startAt))
      .slice(0, 5);
    if (!upcoming.length) {
      return { reply: 'La agenda está vacía por ahora.', readyToApply: false };
    }
    return cardsResponse('Próximas citas:', upcoming.map((a) => toCard(a, clients, services)));
  }

  return null;
}
