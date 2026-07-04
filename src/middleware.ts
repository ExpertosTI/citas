import { defineMiddleware } from 'astro:middleware';
import { GEO_COOKIE, detectCountryCode } from './lib/geo';
import { securityHeaders } from './lib/security';

export const onRequest = defineMiddleware(async (context, next) => {
  const existing = context.cookies.get(GEO_COOKIE)?.value;
  const detected = detectCountryCode(context.request);

  if (!existing || existing !== detected) {
    context.cookies.set(GEO_COOKIE, detected, {
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
      sameSite: 'lax',
      secure: context.url.protocol === 'https:',
      httpOnly: true,
    });
  }

  context.locals.geoCountry = existing && existing.length === 2 ? existing : detected;

  const response = await next();
  const headers = securityHeaders();
  for (const [k, v] of Object.entries(headers)) {
    response.headers.set(k, v);
  }
  return response;
});

declare namespace App {
  interface Locals {
    geoCountry?: string;
  }
}
