import { randomBytes } from 'node:crypto';
import type { Tenant } from './store';
import { countryPreset } from './geo';

export function normalizeTenant(t: Tenant): Tenant {
  const preset = countryPreset(t.country || 'DO');
  return {
    ...t,
    country: t.country || preset.code,
    currency: t.currency || preset.currency,
    closedDays: t.closedDays || [],
    closedWeekdays: t.closedWeekdays ?? [0],
    slotBufferMin: t.slotBufferMin ?? 5,
    lunchStartHour: t.lunchStartHour ?? 13,
    lunchEndHour: t.lunchEndHour ?? 14,
    openHour: t.openHour ?? 9,
    closeHour: t.closeHour ?? 19,
    instagram: t.instagram || '',
    whatsapp: t.whatsapp || t.phone || '',
    logoUrl: t.logoUrl || '',
    accentColor: t.accentColor || '#e8b923',
    bio: t.bio || 'Reserva tu cita en línea · Servicio profesional',
    onboardingComplete: t.onboardingComplete !== false,
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
