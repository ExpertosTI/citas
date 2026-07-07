export type TenantModuleState = {
  enabled: boolean;
  installedAt: string;
  config?: Record<string, unknown>;
};

export type CitasModule = {
  id: string;
  label: string;
  description: string;
  icon: string;
  category: 'core' | 'sales' | 'ops' | 'ai';
  required?: boolean;
  nav?: { href: string; active: string };
  routes: string[];
  apiPrefixes?: string[];
};

export type ModuleCatalogItem = CitasModule & {
  enabled: boolean;
  installedAt?: string;
};
