import { statusLabel } from './appointment-status';
import type { OnboardingAiResponse } from './onboarding-ai';
import { getAppointments, getClients, getServices } from './store';

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
  return /cita|citas|pendiente|pendientes|agenda|hoy|pr[oó]xim|reserva|reservas|horario|bah[ií]a|confirmar|cu[aá]ntas|tengo|hay|dime|lista|mostrar|ver/i.test(
    text,
  );
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

  const describe = (a: (typeof appointments)[0]) => {
    const client = clients.find((c) => c.id === a.clientId);
    const service = services.find((s) => s.id === a.serviceId);
    const day = localDate(a.startAt);
    return `• **${client?.name || 'Cliente'}** — ${service?.name || 'Servicio'} — ${formatWhen(a.startAt)} — _${statusLabel(a.status)}_ · ${a.code} · [${day}](/app?date=${day})`;
  };

  if (/pendiente/.test(n)) {
    const pending = appointments
      .filter((a) => a.status === 'pending')
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
    if (!pending.length) {
      return {
        reply: 'No tienes citas **pendientes** de confirmar. Todo al día.',
        readyToApply: false,
      };
    }
    return {
      reply: `Tienes **${pending.length}** cita(s) pendientes:\n\n${pending.map(describe).join('\n')}\n\nAbre la bahía de ese día para **Confirmar** o **Rechazar**.`,
      readyToApply: false,
    };
  }

  if (/hoy/.test(n)) {
    const today = localDate(new Date().toISOString());
    const todayAppts = appointments
      .filter((a) => localDate(a.startAt) === today && a.status !== 'cancelled')
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
    if (!todayAppts.length) {
      return { reply: 'No hay citas agendadas para **hoy**.', readyToApply: false };
    }
    return {
      reply: `**Hoy** tienes ${todayAppts.length} cita(s):\n\n${todayAppts.map(describe).join('\n')}`,
      readyToApply: false,
    };
  }

  if (/pr[oó]xim|siguiente|futur/.test(n)) {
    const upcoming = appointments
      .filter((a) => a.status !== 'cancelled' && new Date(a.startAt).getTime() >= Date.now())
      .sort((a, b) => a.startAt.localeCompare(b.startAt))
      .slice(0, 8);
    if (!upcoming.length) {
      return { reply: 'No hay citas próximas en la agenda.', readyToApply: false };
    }
    return {
      reply: `Próximas citas:\n\n${upcoming.map(describe).join('\n')}`,
      readyToApply: false,
    };
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
      reply: `Resumen de tu agenda:\n• **Pendientes de confirmar:** ${pending}\n• **Hoy:** ${todayN} cita(s)\n• **Próximas (total):** ${upcoming}\n\nPregúntame "citas pendientes" o "citas de hoy" para el detalle.`,
      readyToApply: false,
    };
  }

  if (/cita|agenda|reserva/.test(n)) {
    const pending = appointments.filter((a) => a.status === 'pending');
    if (pending.length) {
      return {
        reply: `Tienes **${pending.length}** pendiente(s):\n\n${pending.map(describe).join('\n')}`,
        readyToApply: false,
      };
    }
    const upcoming = appointments
      .filter((a) => a.status !== 'cancelled' && new Date(a.startAt).getTime() >= Date.now())
      .sort((a, b) => a.startAt.localeCompare(b.startAt))
      .slice(0, 5);
    if (!upcoming.length) {
      return { reply: 'La agenda está vacía por ahora.', readyToApply: false };
    }
    return {
      reply: `Próximas citas:\n\n${upcoming.map(describe).join('\n')}`,
      readyToApply: false,
    };
  }

  return null;
}
