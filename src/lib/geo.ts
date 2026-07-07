export type CountryPreset = {
  code: string;
  name: string;
  city: string;
  timezone: string;
  phonePrefix: string;
  /** Código internacional sin + (ej. 1, 57, 34) */
  dialCode: string;
  /** Dígitos del número local sin prefijo país */
  localDigits: number;
  /** Ejemplo para placeholder */
  phoneExample: string;
  currency: string;
  locale: string;
};

export const COUNTRY_PRESETS: Record<string, CountryPreset> = {
  DO: {
    code: 'DO',
    name: 'República Dominicana',
    city: 'Santo Domingo',
    timezone: 'America/Santo_Domingo',
    phonePrefix: '+1',
    dialCode: '1',
    localDigits: 10,
    phoneExample: '8095551234',
    currency: 'DOP',
    locale: 'es-DO',
  },
  PR: {
    code: 'PR',
    name: 'Puerto Rico',
    city: 'San Juan',
    timezone: 'America/Puerto_Rico',
    phonePrefix: '+1',
    dialCode: '1',
    localDigits: 10,
    phoneExample: '7875551234',
    currency: 'USD',
    locale: 'es-PR',
  },
  VE: {
    code: 'VE',
    name: 'Venezuela',
    city: 'Caracas',
    timezone: 'America/Caracas',
    phonePrefix: '+58',
    dialCode: '58',
    localDigits: 10,
    phoneExample: '4121234567',
    currency: 'USD',
    locale: 'es-VE',
  },
  CO: {
    code: 'CO',
    name: 'Colombia',
    city: 'Bogotá',
    timezone: 'America/Bogota',
    phonePrefix: '+57',
    dialCode: '57',
    localDigits: 10,
    phoneExample: '3001234567',
    currency: 'COP',
    locale: 'es-CO',
  },
  MX: {
    code: 'MX',
    name: 'México',
    city: 'Ciudad de México',
    timezone: 'America/Mexico_City',
    phonePrefix: '+52',
    dialCode: '52',
    localDigits: 10,
    phoneExample: '5512345678',
    currency: 'MXN',
    locale: 'es-MX',
  },
  US: {
    code: 'US',
    name: 'Estados Unidos',
    city: 'Miami',
    timezone: 'America/New_York',
    phonePrefix: '+1',
    dialCode: '1',
    localDigits: 10,
    phoneExample: '3055551234',
    currency: 'USD',
    locale: 'en-US',
  },
  ES: {
    code: 'ES',
    name: 'España',
    city: 'Madrid',
    timezone: 'Europe/Madrid',
    phonePrefix: '+34',
    dialCode: '34',
    localDigits: 9,
    phoneExample: '612345678',
    currency: 'EUR',
    locale: 'es-ES',
  },
};

const DEFAULT_COUNTRY = 'DO';

function normalizeCountry(code: string | null | undefined) {
  const c = String(code || '').trim().toUpperCase();
  if (c.length === 2 && c !== 'XX' && c !== 'T1') return c;
  return '';
}

/** Detect visitor country from proxy headers or Accept-Language. */
export function detectCountryCode(request: Request) {
  const headers = [
    'cf-ipcountry',
    'x-country-code',
    'x-geo-country',
    'x-appengine-country',
    'cloudfront-viewer-country',
  ];

  for (const key of headers) {
    const hit = normalizeCountry(request.headers.get(key));
    if (hit) return hit;
  }

  const accept = request.headers.get('accept-language') || '';
  const region = accept.match(/\b[a-z]{2}-([A-Z]{2})\b/i);
  if (region?.[1]) {
    const hit = normalizeCountry(region[1]);
    if (hit) return hit;
  }

  return DEFAULT_COUNTRY;
}

export function countryPreset(code: string) {
  return COUNTRY_PRESETS[code] || COUNTRY_PRESETS[DEFAULT_COUNTRY];
}

export function geoFromRequest(request: Request) {
  const country = detectCountryCode(request);
  const preset = countryPreset(country);
  return { country, ...preset };
}

export const GEO_COOKIE = 'citas_geo';

export function geoCookieValue(country: string) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${GEO_COOKIE}=${country}; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax${secure}`;
}
