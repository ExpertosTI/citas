export type AmPm = 'AM' | 'PM';

export function hour24ToParts(hour24: number): { hour: number; period: AmPm } {
  const h = hour24 === 24 ? 0 : hour24;
  if (h === 0) return { hour: 12, period: 'AM' };
  if (h === 12) return { hour: 12, period: 'PM' };
  if (h < 12) return { hour: h, period: 'AM' };
  return { hour: h - 12, period: 'PM' };
}

export function partsToHour24(hour12: number, period: AmPm): number {
  const h = Number(hour12);
  if (period === 'AM') return h === 12 ? 0 : h;
  return h === 12 ? 12 : h + 12;
}

/** "09:00" / "14:30" → "9:00 a. m." */
export function formatTimeHm(hm: string, locale = 'es'): string {
  const [hStr, mStr = '0'] = hm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h)) return hm;
  const d = new Date(2000, 0, 1, h, m);
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: m ? '2-digit' : undefined,
    hour12: true,
  }).format(d);
}

export function hmToParts(hm: string): { hour: number; minute: number; period: AmPm } {
  const [hStr, mStr = '0'] = hm.split(':');
  const { hour, period } = hour24ToParts(Number(hStr));
  return { hour, minute: Number(mStr) || 0, period };
}

export function partsToHm(hour12: number, minute: number, period: AmPm): string {
  const h24 = partsToHour24(hour12, period);
  return `${String(h24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function formatIsoTime(iso: string, tz?: string, locale = 'es'): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

/** Sync hidden inputs from 12h selects inside a form or root element. */
export function bindTime12hFields(root: ParentNode = document) {
  root.querySelectorAll('.time-12h').forEach((wrap) => {
    const hidden = wrap.querySelector('[data-time-hidden]');
    const hSel = wrap.querySelector('[data-time-part="h"]');
    const pSel = wrap.querySelector('[data-time-part="period"]');
    const mSel = wrap.querySelector('[data-time-part="m"]');
    if (!(hidden instanceof HTMLInputElement) || !(hSel instanceof HTMLSelectElement) || !(pSel instanceof HTMLSelectElement)) {
      return;
    }

    const sync = () => {
      if (mSel instanceof HTMLSelectElement) {
        hidden.value = partsToHm(Number(hSel.value), Number(mSel.value), pSel.value as AmPm);
      } else {
        hidden.value = String(partsToHour24(Number(hSel.value), pSel.value as AmPm));
      }
    };

    if (wrap.dataset.timeBound === '1') return;
    wrap.dataset.timeBound = '1';
    hSel.addEventListener('change', sync);
    pSel.addEventListener('change', sync);
    mSel?.addEventListener('change', sync);
    sync();
  });
}
