import type { Appointment, Service, Tenant } from './store';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function localDate(iso: string) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toLocalMin(iso: string) {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function isLunch(tenant: Tenant, hour: number) {
  const ls = tenant.lunchStartHour;
  const le = tenant.lunchEndHour;
  if (ls == null || le == null) return false;
  return hour >= ls && hour < le;
}

export type EnrichedAppointment = Appointment & {
  client?: { name: string; phone?: string; email?: string } | null;
  service?: Service | null;
  colorHex?: string;
};

export type DayBoardSlot = {
  time: string;
  startAt: string;
  kind: 'free' | 'booked' | 'lunch' | 'past';
  span: number;
  appointment?: EnrichedAppointment;
};

export function buildDayBoard(
  tenant: Tenant,
  date: string,
  enriched: EnrichedAppointment[],
  stepMin = 30,
): DayBoardSlot[] {
  const openMin = tenant.openHour * 60;
  const closeMin = tenant.closeHour * 60;
  if (!Number.isFinite(openMin) || !Number.isFinite(closeMin) || closeMin <= openMin) {
    return [];
  }
  const now = Date.now();
  const dayAppts = enriched.filter(
    (a) => localDate(a.startAt) === date && a.status !== 'cancelled',
  );

  const rows: DayBoardSlot[] = [];
  const skipUntil = new Set<number>();

  for (let cursor = openMin; cursor < closeMin; cursor += stepMin) {
    if (skipUntil.has(cursor)) continue;

    const hour = Math.floor(cursor / 60);
    const minute = cursor % 60;
    const time = `${pad(hour)}:${pad(minute)}`;
    const start = new Date(`${date}T${time}:00`);
    const startAt = start.toISOString();

    if (isLunch(tenant, hour)) {
      rows.push({ time, startAt, kind: 'lunch', span: 1 });
      continue;
    }

    const apt = dayAppts.find((a) => {
      const aMin = toLocalMin(a.startAt);
      return aMin >= cursor && aMin < cursor + stepMin;
    });

    if (apt) {
      const duration = Math.max(
        stepMin,
        Math.round((new Date(apt.endAt).getTime() - new Date(apt.startAt).getTime()) / 60_000),
      );
      const span = Math.max(1, Math.ceil(duration / stepMin));
      for (let j = 1; j < span; j++) skipUntil.add(cursor + j * stepMin);
      rows.push({
        time,
        startAt,
        kind: 'booked',
        span,
        appointment: apt,
      });
      continue;
    }

    rows.push({
      time,
      startAt,
      kind: start.getTime() < now ? 'past' : 'free',
      span: 1,
    });
  }

  return rows;
}
