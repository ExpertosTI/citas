import { tenantIdFromRequest } from './auth';
import { getTenantById, type Tenant } from './store';

export type AppPageAuth =
  | { redirect: string }
  | { tenantId: string; tenant: Tenant };

export function postAuthPath(tenant: Pick<Tenant, 'onboardingComplete'>) {
  return tenant.onboardingComplete === true ? '/app' : '/app/onboarding';
}

export async function guardAppPage(
  request: Request,
  opts: { allowOnboarding?: boolean } = {},
): Promise<AppPageAuth> {
  const tenantId = tenantIdFromRequest(request);
  if (!tenantId) return { redirect: '/login' };

  const tenant = await getTenantById(tenantId);
  if (!tenant) return { redirect: '/login' };

  const path = new URL(request.url).pathname;
  const onOnboarding = path.startsWith('/app/onboarding');
  if (!opts.allowOnboarding && !onOnboarding && tenant.onboardingComplete !== true) {
    return { redirect: '/app/onboarding' };
  }

  return { tenantId, tenant };
}

/** Prefer middleware locals; fallback for tests. */
export function appContext(locals: App.Locals, request: Request) {
  if (locals.tenantId && locals.tenant) {
    return { tenantId: locals.tenantId, tenant: locals.tenant };
  }
  const tenantId = tenantIdFromRequest(request);
  if (!tenantId) throw new Error('unauthenticated');
  return { tenantId, tenant: null as Tenant | null };
}
