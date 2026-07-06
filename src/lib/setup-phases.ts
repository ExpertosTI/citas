import type { OnboardingSetupDraft } from './onboarding-ai';
import type { Tenant } from './store';
import { tenantLogoUrl } from './tenant';

export type SetupPhaseId = 'brand' | 'logo' | 'services' | 'schedule' | 'contact' | 'review';

export type SetupPhase = {
  id: SetupPhaseId;
  label: string;
  short: string;
};

export const SETUP_PHASES: SetupPhase[] = [
  { id: 'brand', label: 'Marca', short: 'Nombre y bio' },
  { id: 'logo', label: 'Logo', short: 'Imagen PNG' },
  { id: 'services', label: 'Servicios', short: 'Precios' },
  { id: 'schedule', label: 'Horario', short: 'Apertura' },
  { id: 'contact', label: 'Contacto', short: 'WhatsApp' },
  { id: 'review', label: 'Listo', short: 'Revisar' },
];

export function hasLogo(tenant: Pick<Tenant, 'logoUrl'>, _draft?: OnboardingSetupDraft, logoUploaded?: boolean) {
  if (logoUploaded) return true;
  const url = tenant.logoUrl || '';
  return Boolean(url && (url.startsWith('/api/logo/') || url.startsWith('http')));
}

export function mergedDraft(tenant: Tenant, draft: OnboardingSetupDraft = {}) {
  const services = draft.services?.length ? draft.services : [];
  return {
    businessName: draft.businessName || tenant.businessName,
    bio: draft.bio || tenant.bio,
    phone: draft.phone || tenant.phone,
    whatsapp: draft.whatsapp || tenant.whatsapp,
    instagram: draft.instagram || tenant.instagram,
    address: draft.address || tenant.address,
    city: draft.city || tenant.city,
    accentColor: draft.accentColor || tenant.accentColor,
    openHour: draft.openHour ?? tenant.openHour,
    closeHour: draft.closeHour ?? tenant.closeHour,
    lunchStartHour: draft.lunchStartHour ?? tenant.lunchStartHour,
    lunchEndHour: draft.lunchEndHour ?? tenant.lunchEndHour,
    closedWeekdays: draft.closedWeekdays ?? tenant.closedWeekdays,
    services,
    serviceCount: services.length,
  };
}

export function computeSetupPhase(
  tenant: Tenant,
  draft: OnboardingSetupDraft = {},
  opts: { readyToApply?: boolean; logoUploaded?: boolean; serviceCount?: number } = {},
): SetupPhaseId {
  if (opts.readyToApply) return 'review';

  const svcCount = opts.serviceCount ?? draft.services?.length ?? 0;
  const customBio = draft.bio?.trim() || (tenant.bio && !tenant.bio.includes('Reserva tu cita en línea'));

  if (!customBio && !draft.businessName) return 'brand';
  if (!hasLogo(tenant, draft, opts.logoUploaded)) return 'logo';
  if (svcCount < 2 && (draft.services?.length || 0) < 2) return 'services';
  if (draft.openHour === undefined && draft.closeHour === undefined) return 'schedule';

  const m = mergedDraft(tenant, draft);
  const hasContact = Boolean(m.phone || m.whatsapp || m.instagram || m.address);
  if (!hasContact) return 'contact';

  return 'review';
}

export function phaseSuggestions(
  phase: SetupPhaseId,
  tenant: Tenant,
  currency: string,
  mode: 'onboarding' | 'assistant' = 'onboarding',
): string[] {
  const cur = currency === 'RD$' ? 'RD$' : currency;
  switch (phase) {
    case 'brand':
      return [
        `Somos ${tenant.businessName} — salón profesional en ${tenant.city}`,
        'Bio: Reserva tu cita en línea con los mejores barberos',
      ];
    case 'logo':
      return ['Adjunta tu logo PNG con el botón 📎', 'Puedo usarlo en tu página pública de reservas'];
    case 'services':
      return [`Corte ${cur}500, Barba ${cur}300, Pies ${cur}700`, `Color ${cur}2500 90min, Cejas ${cur}200`];
    case 'schedule':
      return ['9am a 8pm, cerrado domingos', 'Almuerzo de 12 a 2', 'Lunes a sábado 10am–7pm'];
    case 'contact':
      return ['WhatsApp 809-555-1234', 'Instagram @mibarberia', 'Dirección: Av. Principal #10'];
    case 'review':
      return mode === 'assistant'
        ? ['Cambiar un precio', 'Agregar otro servicio', 'Citas de hoy']
        : ['Aplicar y abrir bahía', 'Cambiar un precio', 'Agregar otro servicio'];
    default:
      return [];
  }
}

export function phaseProgress(phase: SetupPhaseId) {
  const idx = SETUP_PHASES.findIndex((p) => p.id === phase);
  return Math.max(0, idx);
}

export function publicLogoPreview(tenant: Tenant) {
  return tenantLogoUrl(tenant);
}
