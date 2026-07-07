import { randomBytes } from 'node:crypto';
import type { Tenant } from './store';
import { countryPreset } from './geo';
import { normalizePhoneDigits } from './phone';
import { normalizeTenantModules } from './modules/tenant-modules';
import { normalizeSubscription } from './subscription';

function sanitizeBusinessHours(t: Tenant) {
  let openHour = t.openHour ?? 9;
  let closeHour = t.closeHour ?? 20;
  let lunchStartHour = t.lunchStartHour ?? 13;
  let lunchEndHour = t.lunchEndHour ?? 14;

  if (closeHour <= openHour || closeHour - openHour < 3) {
    openHour = 9;
    closeHour = 20;
  }

  if (lunchEndHour <= lunchStartHour) {
    lunchStartHour = 13;
    lunchEndHour = 14;
  }

  if (lunchStartHour <= openHour && lunchEndHour >= closeHour) {
    lunchStartHour = 13;
    lunchEndHour = 14;
  }

  lunchStartHour = Math.max(openHour, Math.min(lunchStartHour, closeHour - 2));
  lunchEndHour = Math.max(lunchStartHour + 1, Math.min(lunchEndHour, closeHour));

  return { openHour, closeHour, lunchStartHour, lunchEndHour };
}

export function normalizeTenant(t: Tenant): Tenant {
  const preset = countryPreset(t.country || 'DO');
  const hours = sanitizeBusinessHours(t);
  const country = t.country || preset.code;
  const phoneRaw = (t.phone || '').trim();
  const waRaw = (t.whatsapp || t.phone || '').trim();
  const phone = phoneRaw ? normalizePhoneDigits(phoneRaw, country) : '';
  const whatsapp = waRaw ? normalizePhoneDigits(waRaw, country) : phone;
  return {
    ...t,
    country,
    currency: t.currency || preset.currency,
    closedDays: t.closedDays || [],
    closedWeekdays: t.closedWeekdays ?? [0],
    slotBufferMin: t.slotBufferMin ?? 5,
    ...hours,
    phone,
    instagram: t.instagram || '',
    whatsapp: whatsapp || phone,
    logoUrl: t.logoUrl || '',
    accentColor: t.accentColor || '#e8b923',
    bio: t.bio || 'Reserva tu cita en línea · Servicio profesional',
    onboardingComplete: t.onboardingComplete === true,
    modules: normalizeTenantModules(t.modules, t.createdAt),
    subscription: normalizeSubscription(t.subscription, t.createdAt),
  };
}

export function appointmentCode() {
  return randomBytes(3).toString('hex').toUpperCase();
}

export function tenantLogoUrl(tenant: Tenant) {
  if (tenant.logoUrl?.startsWith('/api/logo/')) return tenant.logoUrl;
  if (tenant.logoUrl?.startsWith('http')) return tenant.logoUrl;
  return `/api/logo/${tenant.id}`;
}
