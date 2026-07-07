const DEFAULT_TZ = 'America/Santo_Domingo';

export function tenantTimezone(tenant: { timezone?: string }) {
  const tz = tenant.timezone?.trim();
  return tz || DEFAULT_TZ;
}

export function localParts(isoOrMs: string | number, tz: string) {
  const d = new Date(isoOrMs);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  const hour = Number(parts.hour === '24' ? '0' : parts.hour);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
    minute: Number(parts.minute),
  };
}

/** Wall-clock YYYY-MM-DD + HH:MM in tenant TZ → UTC Date */
export function zonedDateTime(date: string, time: string, tz: string): Date {
  const [y, mo, d] = date.slice(0, 10).split('-').map(Number);
  const [th, tmi] = time.split(':').map(Number);
  let ms = Date.UTC(y, mo - 1, d, th, tmi, 0);

  for (let attempt = 0; attempt < 6; attempt++) {
    const p = localParts(ms, tz);
    if (p.year === y && p.month === mo && p.day === d && p.hour === th && p.minute === tmi) {
      return new Date(ms);
    }
    const wantMin = th * 60 + tmi;
    const gotMin = p.hour * 60 + p.minute;
    const dayDelta =
      (Date.UTC(y, mo - 1, d) - Date.UTC(p.year, p.month - 1, p.day)) / 86_400_000;
    ms -= (dayDelta * 24 * 60 + (gotMin - wantMin)) * 60_000;
  }

  return new Date(ms);
}

export function localDateKey(iso: string, tz: string) {
  const p = localParts(iso, tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function localMinutes(iso: string, tz: string) {
  const p = localParts(iso, tz);
  return p.hour * 60 + p.minute;
}

export function dayOfWeek(dateYmd: string) {
  const [y, mo, d] = dateYmd.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}

export function dayBoundsUtc(dateYmd: string, tz: string) {
  const from = zonedDateTime(dateYmd, '00:00', tz);
  const to = zonedDateTime(dateYmd, '23:59', tz);
  return {
    from: new Date(from.getTime() - 60_000).toISOString(),
    to: new Date(to.getTime() + 60_000).toISOString(),
  };
}

export function formatTimeLabel(iso: string, tz: string) {
  const p = localParts(iso, tz);
  const h = String(p.hour).padStart(2, '0');
  const m = String(p.minute).padStart(2, '0');
  return m === '00' ? `${h}:00` : `${h}:${m}`;
}
