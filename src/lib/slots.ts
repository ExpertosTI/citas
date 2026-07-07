import type { Appointment, Service, Tenant } from './store';
import { formatTimeHm } from './time-12h';
import { dayOfWeek, localMinutes, tenantTimezone, zonedDateTime } from './tz';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

export function isDayClosed(tenant: Tenant, date: string) {
  if (tenant.closedDays?.includes(date)) return true;
  if (tenant.closedWeekdays?.includes(dayOfWeek(date))) return true;
  return false;
}

export function generateAvailableSlots(
  tenant: Tenant,
  service: Service,
  date: string,
  appointments: Appointment[],
  stepMin = 15,
) {
  if (isDayClosed(tenant, date)) return [];

  const tz = tenantTimezone(tenant);
  const buffer = tenant.slotBufferMin ?? 5;
  const openMin = tenant.openHour * 60;
  const closeMin = tenant.closeHour * 60;
  const lunchStart = tenant.lunchStartHour ?? null;
  const lunchEnd = tenant.lunchEndHour ?? null;
  const now = Date.now();

  const busy = appointments
    .filter((a) => a.status !== 'cancelled')
    .map((a) => ({
      start: new Date(a.startAt).getTime() - buffer * 60_000,
      end: new Date(a.endAt).getTime() + buffer * 60_000,
    }));

  const slots: { time: string; startAt: string; label: string }[] = [];

  for (let cursor = openMin; cursor + service.durationMin <= closeMin; cursor += stepMin) {
    const hour = Math.floor(cursor / 60);
    const minute = cursor % 60;

    if (lunchStart != null && lunchEnd != null && hour >= lunchStart && hour < lunchEnd) continue;

    const start = zonedDateTime(date, `${pad(hour)}:${pad(minute)}`, tz);
    const end = new Date(start.getTime() + service.durationMin * 60_000);

    if (start.getTime() <= now) continue;

    const s = start.getTime();
    const e = end.getTime();
    const conflict = busy.some((b) => overlaps(s, e, b.start, b.end));
    if (conflict) continue;

    const label = formatTimeHm(minute === 0 ? `${pad(hour)}:00` : `${pad(hour)}:${pad(minute)}`);

    slots.push({ time: label, startAt: start.toISOString(), label });
  }

  return slots;
}

export function currencyLabel(tenant: Tenant) {
  if (tenant.currency === 'DOP') return 'RD$';
  if (tenant.currency === 'USD') return '$';
  if (tenant.currency === 'EUR') return '€';
  return tenant.currency || 'RD$';
}
