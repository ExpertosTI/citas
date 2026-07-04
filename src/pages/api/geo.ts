import type { APIRoute } from 'astro';
import { countryPreset, detectCountryCode, geoCookieValue } from '../../lib/geo';
import { json } from '../../lib/http';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const country = detectCountryCode(request);
  const preset = countryPreset(country);
  return json(
    { ok: true, country, ...preset },
    200,
    { 'Set-Cookie': geoCookieValue(country) },
  );
};
