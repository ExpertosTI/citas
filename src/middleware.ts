import { defineMiddleware } from 'astro:middleware';
import { tenantIdFromRequest } from './lib/auth';
import { GEO_COOKIE, detectCountryCode } from './lib/geo';
import { moduleForPath } from './lib/modules/registry';
import { tenantHasModule } from './lib/modules/tenant-modules';
import { postAuthPath } from './lib/page-auth';
import { securityHeaders } from './lib/security';
import { getTenantById } from './lib/store';

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  try {
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

    if (pathname.startsWith('/app')) {
      const tenantId = tenantIdFromRequest(context.request);
      if (!tenantId) return context.redirect('/login');

      const tenant = await getTenantById(tenantId);
      if (!tenant) return context.redirect('/login');

      context.locals.tenantId = tenantId;
      context.locals.tenant = tenant;

      const onOnboarding = pathname.startsWith('/app/onboarding');
      const isReopen = context.url.searchParams.has('open');

      if (onOnboarding) {
        if (tenant.onboardingComplete === true && !isReopen) {
          return context.redirect('/app');
        }
      } else if (tenant.onboardingComplete !== true) {
        return context.redirect('/app/onboarding');
      }

      const modId = moduleForPath(pathname);
      if (modId && !tenantHasModule(tenant, modId)) {
        return context.redirect('/app/perfil?module=disabled');
      }
    }

    if (pathname === '/login' || pathname === '/registro') {
      const tenantId = tenantIdFromRequest(context.request);
      if (tenantId) {
        const tenant = await getTenantById(tenantId);
        if (tenant) return context.redirect(postAuthPath(tenant));
      }
    }

    const response = await next();
    const headers = securityHeaders();
    for (const [k, v] of Object.entries(headers)) {
      response.headers.set(k, v);
    }
    return response;
  } catch (err) {
    console.error('[middleware]', pathname, err);
    return new Response('Internal Server Error', { status: 500 });
  }
});

declare namespace App {
  interface Locals {
    geoCountry?: string;
    tenantId?: string;
    tenant?: import('./lib/store').Tenant;
  }
}
