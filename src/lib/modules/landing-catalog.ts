export type ModuleLandingStatus = 'included' | 'available' | 'roadmap';

export type ModuleLandingItem = {
  id: string;
  label: string;
  description: string;
  pitch: string;
  icon: string;
  category: 'core' | 'sales' | 'ops' | 'ai' | 'growth';
  status: ModuleLandingStatus;
  tags: string[];
};

export const MODULE_CATEGORY_LABELS: Record<ModuleLandingItem['category'], string> = {
  core: 'Base',
  sales: 'Ventas',
  ops: 'Operaciones',
  ai: 'Inteligencia',
  growth: 'Crecimiento',
};

export const MODULE_STATUS_LABELS: Record<ModuleLandingStatus, string> = {
  included: 'Incluido',
  available: 'Listo para activar',
  roadmap: 'Próximamente',
};

/** Catálogo público — módulos actuales y roadmap para el landing. */
export const LANDING_MODULES: ModuleLandingItem[] = [
  {
    id: 'core',
    label: 'Reservas',
    description: 'Bahía del día, servicios, clientes y enlace público.',
    pitch: 'El núcleo de Citas — siempre activo en cada cuenta.',
    icon: '◈',
    category: 'core',
    status: 'included',
    tags: ['Barbería', 'Salón', 'Spa'],
  },
  {
    id: 'assistant',
    label: 'Asistente AI',
    description: 'Configura horarios, servicios y marca conversando.',
    pitch: 'Describe tu negocio en lenguaje natural y listo.',
    icon: '✦',
    category: 'ai',
    status: 'available',
    tags: ['Onboarding', 'Chat', 'Fotos'],
  },
  {
    id: 'waitlist',
    label: 'Lista de espera',
    description: 'Sin cupo, el cliente pide aviso automático.',
    pitch: 'Llena huecos al vuelo cuando se libera un horario.',
    icon: '⏳',
    category: 'ops',
    status: 'available',
    tags: ['Cupos', 'Avisos', 'Retención'],
  },
  {
    id: 'pos',
    label: 'Punto de venta',
    description: 'Cobra bebidas y productos en mostrador.',
    pitch: 'Ideal para cafeterías, bares y negocios híbridos.',
    icon: '🧃',
    category: 'sales',
    status: 'available',
    tags: ['Bebidas', 'Mostrador', 'Ticket'],
  },
  {
    id: 'inventory',
    label: 'Inventario',
    description: 'Stock de productos, alertas de bajo inventario.',
    pitch: 'Sabe cuánto vendiste y qué reponer.',
    icon: '📦',
    category: 'ops',
    status: 'roadmap',
    tags: ['Stock', 'Alertas'],
  },
  {
    id: 'loyalty',
    label: 'Fidelidad',
    description: 'Puntos, sellos y recompensas por visita.',
    pitch: 'Clientes que vuelven — sin tarjeta física.',
    icon: '★',
    category: 'growth',
    status: 'roadmap',
    tags: ['Puntos', 'Retención'],
  },
  {
    id: 'reports',
    label: 'Reportes',
    description: 'Ingresos, ocupación y rendimiento por servicio.',
    pitch: 'Decisiones con datos, no con intuición.',
    icon: '📊',
    category: 'growth',
    status: 'roadmap',
    tags: ['Analytics', 'Exportar'],
  },
  {
    id: 'staff',
    label: 'Equipo',
    description: 'Varios barberos o estilistas con agenda propia.',
    pitch: 'Cada profesional con su bahía y comisiones.',
    icon: '👥',
    category: 'ops',
    status: 'roadmap',
    tags: ['Multi-caja', 'Comisiones'],
  },
  {
    id: 'multisite',
    label: 'Multi-sucursal',
    description: 'Varias locaciones bajo una misma marca.',
    pitch: 'Cadena de locales con panel centralizado.',
    icon: '🏪',
    category: 'growth',
    status: 'roadmap',
    tags: ['Franquicia', 'Cadena'],
  },
];

export const LANDING_INDUSTRIES = [
  { icon: '✂', label: 'Barberías', modules: ['core', 'assistant', 'waitlist'] },
  { icon: '💇', label: 'Salones', modules: ['core', 'assistant', 'staff'] },
  { icon: '☕', label: 'Cafeterías', modules: ['core', 'pos', 'inventory'] },
  { icon: '🍹', label: 'Bares', modules: ['core', 'pos', 'waitlist'] },
  { icon: '🧖', label: 'Spas', modules: ['core', 'assistant', 'loyalty'] },
] as const;
