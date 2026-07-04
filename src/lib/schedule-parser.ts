export type ParsedSchedule = {
  openHour?: number;
  closeHour?: number;
  lunchStartHour?: number;
  lunchEndHour?: number;
  closedWeekdays?: number[];
};

const WEEKDAY_MAP: Record<string, number> = {
  domingo: 0,
  dom: 0,
  lunes: 1,
  lun: 1,
  martes: 2,
  mar: 2,
  miercoles: 3,
  miércoles: 3,
  mie: 3,
  mié: 3,
  jueves: 4,
  jue: 4,
  viernes: 5,
  vie: 5,
  sabado: 6,
  sábado: 6,
  sab: 6,
  sáb: 6,
};

function normalizeText(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Parse 9, 9:30, 9am, 9:30 pm, 20:00 → hour 0-24 */
export function parseHourToken(raw: string): number | null {
  let t = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (!t) return null;

  const h24 = t.match(/^(\d{1,2}):(\d{2})$/);
  if (h24) {
    const h = Number(h24[1]);
    if (h >= 0 && h <= 24) return h === 24 ? 24 : h;
  }

  const ampm = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.?\s*m\.?|p\.?\s*m\.?)$/i);
  if (ampm) {
    let h = Number(ampm[1]);
    const suffix = ampm[3].replace(/\./g, '').toLowerCase();
    if (suffix.startsWith('p') && h < 12) h += 12;
    if (suffix.startsWith('a') && h === 12) h = 0;
    return Math.min(24, Math.max(0, h));
  }

  const plain = t.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (plain) {
    const h = Number(plain[1]);
    if (h >= 0 && h <= 24) {
      // Sin am/pm: 1-7 → tarde probable en negocios (13-19)
      if (h >= 1 && h <= 7 && !t.includes(':')) return h + 12;
      return h === 24 ? 24 : h;
    }
  }

  const phrases: Record<string, number> = {
    mediodia: 12,
    'medio-dia': 12,
    noon: 12,
    medianoche: 0,
    midnight: 0,
  };
  for (const [k, v] of Object.entries(phrases)) {
    if (t.includes(k)) return v;
  }

  return null;
}

function parseHourRange(text: string): { open: number; close: number } | null {
  const n = normalizeText(text);

  const patterns = [
    /(?:abro|abre|abrimos|horario|de)\s*(?:a\s*)?(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.?m\.?|p\.?m\.?)?)\s*(?:a|hasta|-|–|—)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.?m\.?|p\.?m\.?)?)/i,
    /(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.?m\.?|p\.?m\.?)?)\s*(?:a|hasta|-|–|—)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.?m\.?|p\.?m\.?)?)/i,
    /(?:de\s*)?(\d{1,2})\s*(?:de la manana|am|a\.?m\.?)\s*(?:a|hasta)\s*(\d{1,2})\s*(?:de la noche|pm|p\.?m\.?)/i,
  ];

  for (const re of patterns) {
    const m = n.match(re) || text.match(re);
    if (m) {
      let open = parseHourToken(m[1]);
      let close = parseHourToken(m[2]);
      if (open !== null && close !== null) {
        if (close <= open && close <= 12) close += 12;
        if (close > open) return { open, close };
      }
    }
  }

  return null;
}

function parseLunchBreak(text: string): { start: number; end: number } | null {
  const n = normalizeText(text);
  if (!/almuerzo|mediodia|comida|siesta/.test(n)) return null;

  const m = n.match(
    /(?:almuerzo|mediodia|comida|siesta)?\s*(?:de\s*)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:a|hasta|-|–|—)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
  );
  if (!m) return null;

  const start = parseHourToken(m[1]);
  let end = parseHourToken(m[2]);
  if (start === null || end === null) return null;
  if (end <= start && end <= 12) end += 12;
  if (end <= start) return null;
  return { start, end };
}

function parseClosedWeekdays(text: string): number[] {
  const n = normalizeText(text);
  const found = new Set<number>();

  if (/todos los dias|todos los días|7 dias|7 días/.test(n) && /abierto/.test(n)) {
    return [];
  }

  for (const [word, day] of Object.entries(WEEKDAY_MAP)) {
    const closedRe = new RegExp(`(?:cerrado|cierra|descanso|no abro|no abrimos|libre|feriado)[^,.]{0,30}\\b${word}\\b`, 'i');
    const closedRe2 = new RegExp(`\\b${word}s?\\b[^,.]{0,20}(?:cerrado|descanso|no abro)`, 'i');
    if (closedRe.test(n) || closedRe2.test(n)) found.add(day);
  }

  const rangeMatch = n.match(/(?:lunes|lun)\s*(?:a|hasta|-)\s*(?:viernes|vie)/);
  if (/cerrado/.test(n) && rangeMatch) {
    found.add(0);
    found.add(6);
  }

  if (/fin de semana/.test(n) && /cerrado|descanso|no abro/.test(n)) {
    found.add(0);
    found.add(6);
  }

  if (/solo/.test(n)) {
    for (const [word, day] of Object.entries(WEEKDAY_MAP)) {
      if (new RegExp(`solo\\s+(?:los\\s+)?${word}s?`, 'i').test(n)) {
        for (let d = 0; d <= 6; d++) {
          if (d !== day) found.add(d);
        }
      }
    }
  }

  return [...found].sort((a, b) => a - b);
}

export function parseScheduleFromText(text: string): ParsedSchedule {
  const result: ParsedSchedule = {};
  const range = parseHourRange(text);
  if (range) {
    result.openHour = range.open;
    result.closeHour = range.close;
  }

  const lunch = parseLunchBreak(text);
  if (lunch) {
    result.lunchStartHour = lunch.start;
    result.lunchEndHour = lunch.end;
  }

  const closed = parseClosedWeekdays(text);
  if (closed.length) result.closedWeekdays = closed;

  return result;
}

export function weekdayLabels(days: number[]) {
  const names = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  return days.map((d) => names[d] || String(d)).join(', ');
}

export function formatHour(h: number) {
  if (h === 0) return '12:00 AM';
  if (h === 12) return '12:00 PM';
  if (h === 24) return '12:00 AM';
  if (h < 12) return `${h}:00 AM`;
  return `${h - 12}:00 PM`;
}
