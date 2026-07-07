import { tenantIdFromRequest } from './auth';
import { bad } from './http';
import { moduleForPath } from './modules/registry';
import { tenantHasModule } from './modules/tenant-modules';
import { getTenantById, type Tenant } from './store';

type ModuleGuardOk = { tenant: Tenant; tenantId: string; error?: never };
type ModuleGuardFail = { tenant?: Tenant; tenantId?: string; error: Response };

export async function requireModule(
  request: Request,
  moduleId?: string,
): Promise<ModuleGuardOk | ModuleGuardFail> {
  const tenantId = tenantIdFromRequest(request);
  if (!tenantId) return { error: bad('No autenticado', 401) };

  const tenant = await getTenantById(tenantId);
  if (!tenant) return { error: bad('Sesión inválida', 401) };

  const id = moduleId || moduleForPath(new URL(request.url).pathname);
  if (id && !tenantHasModule(tenant, id)) {
    return { error: bad('Módulo no activo', 403), tenant };
  }

  return { tenant, tenantId };
}
