import type { Tenant } from '../store';
import { getModuleDef, listModuleDefs, type ModuleCatalogItem } from './registry';
import type { TenantModuleState } from './types';

const DEFAULT_ENABLED = ['core', 'waitlist', 'assistant'] as const;

function now() {
  return new Date().toISOString();
}

export function defaultTenantModules(createdAt?: string): Record<string, TenantModuleState> {
  const ts = createdAt || now();
  const out: Record<string, TenantModuleState> = {};
  for (const mod of listModuleDefs()) {
    const enabled = mod.required || DEFAULT_ENABLED.includes(mod.id as (typeof DEFAULT_ENABLED)[number]);
    out[mod.id] = {
      enabled: mod.required ? true : enabled,
      installedAt: enabled ? ts : '',
    };
  }
  return out;
}

export function normalizeTenantModules(
  raw: Record<string, TenantModuleState> | undefined,
  createdAt?: string,
): Record<string, TenantModuleState> {
  const base = defaultTenantModules(createdAt);
  if (!raw) return base;

  for (const mod of listModuleDefs()) {
    const entry = raw[mod.id];
    if (!entry) continue;
    base[mod.id] = {
      enabled: mod.required ? true : Boolean(entry.enabled),
      installedAt: entry.installedAt || base[mod.id].installedAt,
      config: entry.config,
    };
  }
  return base;
}

export function tenantModuleMap(tenant: Tenant): Record<string, TenantModuleState> {
  return normalizeTenantModules(tenant.modules, tenant.createdAt);
}

export function enabledModuleIds(tenant: Tenant): Set<string> {
  const map = tenantModuleMap(tenant);
  return new Set(Object.entries(map).filter(([, v]) => v.enabled).map(([k]) => k));
}

export function tenantHasModule(tenant: Tenant, moduleId: string): boolean {
  const mod = getModuleDef(moduleId);
  if (!mod) return false;
  if (mod.required) return true;
  return tenantModuleMap(tenant)[moduleId]?.enabled === true;
}

export function catalogForTenant(tenant: Tenant): ModuleCatalogItem[] {
  const map = tenantModuleMap(tenant);
  return listModuleDefs()
    .filter((m) => !m.required)
    .map((m) => ({
      ...m,
      enabled: map[m.id]?.enabled === true,
      installedAt: map[m.id]?.installedAt || undefined,
    }));
}

export async function setTenantModule(
  tenantId: string,
  moduleId: string,
  enabled: boolean,
  updateTenant: (id: string, patch: Partial<Tenant>) => Promise<Tenant | null>,
  getTenantById: (id: string) => Promise<Tenant | null>,
) {
  const mod = getModuleDef(moduleId);
  if (!mod) throw new Error('module_unknown');
  if (mod.required) throw new Error('module_required');

  const tenant = await getTenantById(tenantId);
  if (!tenant) throw new Error('tenant_not_found');

  const modules = tenantModuleMap(tenant);
  const prev = modules[moduleId];
  modules[moduleId] = {
    enabled,
    installedAt: enabled ? prev?.installedAt || now() : prev?.installedAt || '',
    config: prev?.config,
  };

  const updated = await updateTenant(tenantId, { modules } as Partial<Tenant>);
  if (!updated) throw new Error('update_failed');
  return updated;
}
