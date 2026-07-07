import type { Service } from './store';

export type ServicePricingMode = 'fixed' | 'quote';

export function servicePricingMode(service: Pick<Service, 'pricingMode'>): ServicePricingMode {
  return service.pricingMode === 'quote' ? 'quote' : 'fixed';
}

export function currencySymbol(currency: string) {
  if (currency === 'DOP') return 'RD$';
  if (currency === 'USD') return '$';
  if (currency === 'EUR') return '€';
  return currency || 'RD$';
}

/** Meta line for public booking — hides price when quote/dynamic */
export function publicServiceMeta(service: Service, currency: string) {
  const dur = `${service.durationMin} min`;
  if (servicePricingMode(service) === 'quote') {
    return `${dur} · Precio según diseño`;
  }
  return `${dur} · ${currencySymbol(currency)}${service.price}`;
}

/** Meta for admin/staff — always shows reference info */
export function adminServiceMeta(service: Service, currency: string) {
  const dur = `${service.durationMin} min`;
  if (servicePricingMode(service) === 'quote') {
    return `${dur} · Precio variable`;
  }
  return `${dur} · ${currencySymbol(currency)}${service.price}`;
}
