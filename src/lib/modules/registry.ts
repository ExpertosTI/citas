import type { CitasModule } from './types';

/** Catálogo de módulos instalables por tenant. */
export const MODULE_CATALOG: CitasModule[] = [
  {
    id: 'core',
    label: 'Reservas',
    description: 'Bahía, servicios, clientes y enlace público.',
    icon: '◈',
    category: 'core',
    required: true,
    routes: ['/app', '/app/servicios', '/app/clientes', '/app/perfil'],
    apiPrefixes: ['/api/appointments', '/api/services', '/api/clients', '/api/profile', '/api/slots', '/api/book'],
  },
  {
    id: 'waitlist',
    label: 'Lista de espera',
    description: 'Cupos llenos → el cliente pide aviso automático.',
    icon: '⏳',
    category: 'ops',
    nav: { href: '/app/waitlist', active: 'waitlist' },
    routes: ['/app/waitlist'],
    apiPrefixes: ['/api/waitlist'],
  },
  {
    id: 'assistant',
    label: 'Asistente AI',
    description: 'Configura tu negocio y agenda por chat.',
    icon: '✦',
    category: 'ai',
    nav: { href: '#asistente', active: 'asistente' },
    routes: [],
    apiPrefixes: ['/api/onboarding'],
  },
  {
    id: 'pos',
    label: 'Punto de venta',
    description: 'Vende bebidas y productos en mostrador — ideal para cafeterías y bares.',
    icon: '🧃',
    category: 'sales',
    nav: { href: '/app/pos', active: 'pos' },
    routes: ['/app/pos'],
    apiPrefixes: ['/api/pos'],
  },
];

const byId = new Map(MODULE_CATALOG.map((m) => [m.id, m]));

export function getModuleDef(id: string) {
  return byId.get(id) || null;
}

export function listModuleDefs() {
  return MODULE_CATALOG;
}

export function moduleForPath(pathname: string): string | null {
  for (const mod of MODULE_CATALOG) {
    if (mod.required) continue;
    if (mod.routes.some((r) => pathname === r || pathname.startsWith(`${r}/`))) return mod.id;
    if (mod.apiPrefixes?.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return mod.id;
  }
  return null;
}

export type NavItem = {
  id: string;
  href: string;
  label: string;
  icon: string;
};

const CORE_NAV: NavItem[] = [
  { id: 'bahia', href: '/app', label: 'Bahía', icon: '◈' },
  { id: 'servicios', href: '/app/servicios', label: 'Servicios', icon: '✂' },
  { id: 'clientes', href: '/app/clientes', label: 'Clientes', icon: '◎' },
];

export function navForTenant(enabledIds: Set<string>): NavItem[] {
  const items: NavItem[] = [...CORE_NAV];

  for (const mod of MODULE_CATALOG) {
    if (!mod.nav || mod.required || !enabledIds.has(mod.id)) continue;
    items.push({
      id: mod.nav.active,
      href: mod.nav.href,
      label: mod.label,
      icon: mod.icon,
    });
  }

  items.push({ id: 'perfil', href: '/app/perfil', label: 'Perfil', icon: '✦' });

  if (enabledIds.has('assistant')) {
    items.push({ id: 'asistente', href: '#asistente', label: 'Asistente', icon: '✦' });
  }

  return items;
}
