import { countryPreset } from './geo';

/** Solo dígitos. */
export function digitsOnly(raw: string) {
  return String(raw || '').replace(/\D/g, '');
}

/**
 * Normaliza a dígitos internacionales para wa.me / tel:+ (sin +).
 * Ej. DO: 8095551234 → 18095551234 · CO: 3001234567 → 573001234567
 */
export function normalizePhoneDigits(raw: string, countryCode = 'DO'): string {
  let d = digitsOnly(raw);
  if (!d) return '';

  const preset = countryPreset(countryCode);
  const { dialCode, localDigits } = preset;

  if (d.startsWith(dialCode) && d.length >= dialCode.length + 7) {
    return d;
  }

  if (dialCode === '1') {
    if (d.length === 10) return `1${d}`;
    if (d.length === 11 && d.startsWith('1')) return d;
  }

  if (d.startsWith('00')) {
    d = d.slice(2);
    if (d.startsWith(dialCode)) return d;
  }

  if (d.startsWith('0') && d.length > localDigits) {
    d = d.slice(1);
  }

  if (d.length === localDigits && !d.startsWith(dialCode)) {
    return `${dialCode}${d}`;
  }

  if (!d.startsWith(dialCode) && d.length >= 8 && d.length <= localDigits + 2) {
    return `${dialCode}${d}`;
  }

  return d;
}

/** Para inputs: quita prefijo internacional y muestra número local. */
export function phoneForInput(stored: string, countryCode = 'DO'): string {
  const d = digitsOnly(stored);
  if (!d) return String(stored || '').trim();

  const { dialCode, localDigits } = countryPreset(countryCode);

  if (dialCode === '1' && d.length === 11 && d.startsWith('1')) {
    return d.slice(1);
  }

  if (d.startsWith(dialCode) && d.length > dialCode.length) {
    const local = d.slice(dialCode.length);
    if (local.length <= localDigits + 1) return local;
  }

  return d;
}

export function formatPhoneDisplay(raw: string, countryCode = 'DO'): string {
  const local = phoneForInput(raw, countryCode);
  if (!local) return '';
  const preset = countryPreset(countryCode);
  if (preset.dialCode === '1' && local.length === 10) {
    return `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`;
  }
  return local;
}

export function whatsAppUrl(phone: string, text = '', countryCode = 'DO') {
  const digits = normalizePhoneDigits(phone, countryCode);
  if (!digits) return '';
  const q = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${digits}${q}`;
}

export function telUrl(phone: string, countryCode = 'DO') {
  const digits = normalizePhoneDigits(phone, countryCode);
  return digits ? `tel:+${digits}` : '';
}
