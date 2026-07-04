import { defineMiddleware } from 'astro:middleware';
import { GEO_COOKIE, detectCountryCode } from './lib/geo';

export const onRequest = defineMiddleware(async (context, next) => {
  const existing = context.cookies.get(GEO_COOKIE)?.value;
  const detected = detectCountryCode(context.request);

  if (!existing || existing !== detected) {
    context.cookies.set(GEO_COOKIE, detected, {
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
      sameSite: 'lax',
      secure: context.url.protocol === 'https:',
      httpOnly: false,
    });
  }

  context.locals.geoCountry = existing && existing.length === 2 ? existing : detected;
  return next();
});

declare namespace App {
  interface Locals {
    geoCountry?: string;
  }
}
