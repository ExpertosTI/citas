import { promises as fs } from 'node:fs';
import path from 'node:path';
import { hashPassword, newId, slugify } from './auth';

const DATA_DIR = process.env.CITAS_DATA_DIR || path.join(process.cwd(), 'data');

export const APPOINTMENT_COLORS = [
  { id: 'rose', hex: '#e879a9', label: 'Rosa' },
  { id: 'lavender', hex: '#a78bfa', label: 'Lavanda' },
  { id: 'mint', hex: '#34d399', label: 'Menta' },
  { id: 'peach', hex: '#fb923c', label: 'Durazno' },
  { id: 'sky', hex: '#38bdf8', label: 'Cielo' },
  { id: 'gold', hex: '#d4a574', label: 'Oro' },
  { id: 'plum', hex: '#c084fc', label: 'Ciruela' },
  { id: 'coral', hex: '#f87171', label: 'Coral' },
] as const;

export type AppointmentColor = (typeof APPOINTMENT_COLORS)[number]['id'];

export type Tenant = {
  id: string;
  slug: string;
  businessName: string;
  ownerName: string;
  email: string;
  passwordHash: string;
  phone: string;
  address: string;
  city: string;
  bio: string;
  accentColor: string;
  timezone: string;
  openHour: number;
  closeHour: number;
  createdAt: string;
};

export type Service = {
  id: string;
  tenantId: string;
  name: string;
  durationMin: number;
  price: number;
  color: AppointmentColor;
  active: boolean;
};

export type Client = {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  phone: string;
  notes?: string;
  createdAt: string;
};

export type AppointmentStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';

export type Appointment = {
  id: string;
  tenantId: string;
  clientId: string;
  serviceId: string;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  color: AppointmentColor;
  notes?: string;
  source: 'dashboard' | 'public';
  createdAt: string;
  reminderSentAt?: string | null;
};

export type PublicTenant = Omit<Tenant, 'passwordHash' | 'email'> & { email?: never };

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  await ensureDataDir();
  const full = path.join(DATA_DIR, file);
  try {
    const raw = await fs.readFile(full, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    await fs.writeFile(full, JSON.stringify(fallback, null, 2), 'utf8');
    return fallback;
  }
}

async function writeJson<T>(file: string, data: T) {
  await ensureDataDir();
  const full = path.join(DATA_DIR, file);
  const tmp = `${full}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, full);
}

function defaultServices(tenantId: string): Service[] {
  return [
    { id: newId('svc'), tenantId, name: 'Corte mujer', durationMin: 45, price: 25, color: 'rose', active: true },
    { id: newId('svc'), tenantId, name: 'Corte hombre', durationMin: 30, price: 18, color: 'sky', active: true },
    { id: newId('svc'), tenantId, name: 'Coloración', durationMin: 90, price: 55, color: 'lavender', active: true },
    { id: newId('svc'), tenantId, name: 'Peinado / Brushing', durationMin: 40, price: 22, color: 'gold', active: true },
    { id: newId('svc'), tenantId, name: 'Barba', durationMin: 20, price: 12, color: 'mint', active: true },
  ];
}

export function publicTenant(t: Tenant): PublicTenant {
  const { passwordHash: _, email: __, ...rest } = t;
  return rest;
}

export function safeTenant(t: Tenant) {
  const { passwordHash: _, ...rest } = t;
  return rest;
}

export async function getTenants(): Promise<Tenant[]> {
  return readJson<Tenant[]>('tenants.json', []);
}

export async function getTenantById(id: string) {
  const tenants = await getTenants();
  return tenants.find((t) => t.id === id) || null;
}

export async function getTenantBySlug(slug: string) {
  const tenants = await getTenants();
  return tenants.find((t) => t.slug === slug) || null;
}

export async function getTenantByEmail(email: string) {
  const tenants = await getTenants();
  const key = email.trim().toLowerCase();
  return tenants.find((t) => t.email === key) || null;
}

export async function createTenant(input: {
  businessName: string;
  ownerName: string;
  email: string;
  password: string;
  phone?: string;
  city?: string;
  slug?: string;
}) {
  const tenants = await getTenants();
  const email = input.email.trim().toLowerCase();
  if (tenants.some((t) => t.email === email)) {
    throw new Error('email_taken');
  }

  let base = slugify(input.slug || input.businessName) || 'salon';
  let slug = base;
  let n = 1;
  while (tenants.some((t) => t.slug === slug)) {
    slug = `${base}-${n++}`;
  }

  const tenant: Tenant = {
    id: newId('ten'),
    slug,
    businessName: input.businessName.trim(),
    ownerName: input.ownerName.trim(),
    email,
    passwordHash: hashPassword(input.password),
    phone: (input.phone || '').trim(),
    address: '',
    city: (input.city || '').trim(),
    bio: 'Salón de belleza · Reserva tu cita en línea',
    accentColor: '#c45c8a',
    timezone: 'America/Caracas',
    openHour: 9,
    closeHour: 19,
    createdAt: new Date().toISOString(),
  };

  tenants.push(tenant);
  await writeJson('tenants.json', tenants);

  const services = await getAllServices();
  services.push(...defaultServices(tenant.id));
  await writeJson('services.json', services);

  return tenant;
}

export async function updateTenant(id: string, patch: Partial<Tenant>) {
  const tenants = await getTenants();
  const idx = tenants.findIndex((t) => t.id === id);
  if (idx < 0) return null;

  const next = { ...tenants[idx], ...patch, id: tenants[idx].id, passwordHash: tenants[idx].passwordHash };

  if (patch.slug && patch.slug !== tenants[idx].slug) {
    const slug = slugify(patch.slug);
    if (!slug) throw new Error('invalid_slug');
    if (tenants.some((t) => t.slug === slug && t.id !== id)) throw new Error('slug_taken');
    next.slug = slug;
  }

  if (patch.email && patch.email !== tenants[idx].email) {
    const email = patch.email.trim().toLowerCase();
    if (tenants.some((t) => t.email === email && t.id !== id)) throw new Error('email_taken');
    next.email = email;
  }

  if (patch.passwordHash) next.passwordHash = patch.passwordHash;

  tenants[idx] = next;
  await writeJson('tenants.json', tenants);
  return next;
}

async function getAllServices() {
  return readJson<Service[]>('services.json', []);
}

export async function getServices(tenantId: string) {
  const all = await getAllServices();
  return all.filter((s) => s.tenantId === tenantId);
}

export async function saveService(tenantId: string, input: Partial<Service> & { name: string }) {
  const all = await getAllServices();
  if (input.id) {
    const idx = all.findIndex((s) => s.id === input.id && s.tenantId === tenantId);
    if (idx < 0) return null;
    all[idx] = {
      ...all[idx],
      name: input.name.trim(),
      durationMin: Number(input.durationMin ?? all[idx].durationMin),
      price: Number(input.price ?? all[idx].price),
      color: (input.color || all[idx].color) as AppointmentColor,
      active: input.active ?? all[idx].active,
    };
    await writeJson('services.json', all);
    return all[idx];
  }

  const service: Service = {
    id: newId('svc'),
    tenantId,
    name: input.name.trim(),
    durationMin: Number(input.durationMin || 30),
    price: Number(input.price || 0),
    color: (input.color || 'rose') as AppointmentColor,
    active: input.active ?? true,
  };
  all.push(service);
  await writeJson('services.json', all);
  return service;
}

export async function deleteService(tenantId: string, id: string) {
  const all = await getAllServices();
  const next = all.filter((s) => !(s.id === id && s.tenantId === tenantId));
  await writeJson('services.json', next);
  return next.length < all.length;
}

async function getAllClients() {
  return readJson<Client[]>('clients.json', []);
}

export async function getClients(tenantId: string) {
  const all = await getAllClients();
  return all.filter((c) => c.tenantId === tenantId).sort((a, b) => a.name.localeCompare(b.name));
}

export async function findOrCreateClient(
  tenantId: string,
  input: { name: string; email?: string; phone?: string },
) {
  const all = await getAllClients();
  const email = (input.email || '').trim().toLowerCase();
  const phone = (input.phone || '').trim();
  let client = all.find(
    (c) =>
      c.tenantId === tenantId &&
      ((email && c.email === email) || (phone && c.phone === phone && phone.length >= 7)),
  );

  if (client) {
    client = {
      ...client,
      name: input.name.trim() || client.name,
      email: email || client.email,
      phone: phone || client.phone,
    };
    const idx = all.findIndex((c) => c.id === client!.id);
    all[idx] = client;
    await writeJson('clients.json', all);
    return client;
  }

  client = {
    id: newId('cli'),
    tenantId,
    name: input.name.trim(),
    email,
    phone,
    createdAt: new Date().toISOString(),
  };
  all.push(client);
  await writeJson('clients.json', all);
  return client;
}

export async function saveClient(tenantId: string, input: Partial<Client> & { name: string }) {
  const all = await getAllClients();
  if (input.id) {
    const idx = all.findIndex((c) => c.id === input.id && c.tenantId === tenantId);
    if (idx < 0) return null;
    all[idx] = {
      ...all[idx],
      name: input.name.trim(),
      email: (input.email || all[idx].email || '').trim().toLowerCase(),
      phone: (input.phone || all[idx].phone || '').trim(),
      notes: input.notes ?? all[idx].notes,
    };
    await writeJson('clients.json', all);
    return all[idx];
  }

  const client: Client = {
    id: newId('cli'),
    tenantId,
    name: input.name.trim(),
    email: (input.email || '').trim().toLowerCase(),
    phone: (input.phone || '').trim(),
    notes: input.notes,
    createdAt: new Date().toISOString(),
  };
  all.push(client);
  await writeJson('clients.json', all);
  return client;
}

async function getAllAppointments() {
  return readJson<Appointment[]>('appointments.json', []);
}

export async function getAppointments(tenantId: string, from?: string, to?: string) {
  const all = await getAllAppointments();
  return all
    .filter((a) => a.tenantId === tenantId)
    .filter((a) => {
      if (!from && !to) return true;
      const t = new Date(a.startAt).getTime();
      if (from && t < new Date(from).getTime()) return false;
      if (to && t > new Date(to).getTime()) return false;
      return true;
    })
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}

export async function getAppointment(tenantId: string, id: string) {
  const all = await getAllAppointments();
  return all.find((a) => a.id === id && a.tenantId === tenantId) || null;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

export async function createAppointment(
  tenantId: string,
  input: {
    clientId: string;
    serviceId: string;
    startAt: string;
    notes?: string;
    color?: AppointmentColor;
    status?: AppointmentStatus;
    source?: 'dashboard' | 'public';
  },
) {
  const services = await getServices(tenantId);
  const service = services.find((s) => s.id === input.serviceId);
  if (!service) throw new Error('service_not_found');

  const clients = await getClients(tenantId);
  const client = clients.find((c) => c.id === input.clientId);
  if (!client) throw new Error('client_not_found');

  const start = new Date(input.startAt);
  if (!Number.isFinite(start.getTime())) throw new Error('invalid_start');
  const end = new Date(start.getTime() + service.durationMin * 60_000);

  const dayStart = new Date(start);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(start);
  dayEnd.setHours(23, 59, 59, 999);

  const existing = await getAppointments(tenantId, dayStart.toISOString(), dayEnd.toISOString());
  const conflict = existing.some(
    (a) =>
      a.status !== 'cancelled' &&
      overlaps(start.getTime(), end.getTime(), new Date(a.startAt).getTime(), new Date(a.endAt).getTime()),
  );
  if (conflict) throw new Error('slot_taken');

  const appointment: Appointment = {
    id: newId('apt'),
    tenantId,
    clientId: client.id,
    serviceId: service.id,
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    status: input.status || 'confirmed',
    color: input.color || service.color,
    notes: input.notes,
    source: input.source || 'dashboard',
    createdAt: new Date().toISOString(),
  };

  const all = await getAllAppointments();
  all.push(appointment);
  await writeJson('appointments.json', all.slice(-5000));
  return appointment;
}

export async function updateAppointment(
  tenantId: string,
  id: string,
  patch: Partial<Pick<Appointment, 'status' | 'notes' | 'color' | 'startAt' | 'endAt' | 'reminderSentAt'>>,
) {
  const all = await getAllAppointments();
  const idx = all.findIndex((a) => a.id === id && a.tenantId === tenantId);
  if (idx < 0) return null;

  let next = { ...all[idx], ...patch };

  if (patch.startAt) {
    const services = await getServices(tenantId);
    const service = services.find((s) => s.id === next.serviceId);
    const start = new Date(patch.startAt);
    const duration = service?.durationMin || 30;
    next.startAt = start.toISOString();
    next.endAt = new Date(start.getTime() + duration * 60_000).toISOString();
  }

  all[idx] = next;
  await writeJson('appointments.json', all);
  return next;
}

export async function getBoardDay(tenantId: string, dateIso: string) {
  const day = dateIso.slice(0, 10);
  const from = `${day}T00:00:00.000Z`;
  const to = `${day}T23:59:59.999Z`;

  // Use local-ish range: expand window to cover timezone offsets
  const fromLocal = new Date(`${day}T00:00:00`);
  const toLocal = new Date(`${day}T23:59:59.999`);
  const appointments = await getAppointments(
    tenantId,
    new Date(fromLocal.getTime() - 12 * 3600_000).toISOString(),
    new Date(toLocal.getTime() + 12 * 3600_000).toISOString(),
  );

  const dayAppts = appointments.filter((a) => a.startAt.slice(0, 10) === day || localDate(a.startAt) === day);
  const [services, clients, tenant] = await Promise.all([
    getServices(tenantId),
    getClients(tenantId),
    getTenantById(tenantId),
  ]);

  const enriched = dayAppts.map((a) => ({
    ...a,
    client: clients.find((c) => c.id === a.clientId) || null,
    service: services.find((s) => s.id === a.serviceId) || null,
    colorHex: APPOINTMENT_COLORS.find((c) => c.id === a.color)?.hex || '#e879a9',
  }));

  return {
    date: day,
    tenant: tenant ? safeTenant(tenant) : null,
    appointments: enriched,
    services: services.filter((s) => s.active),
    clients,
    colors: APPOINTMENT_COLORS,
    range: { from, to },
  };
}

function localDate(iso: string) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function getDashboardStats(tenantId: string) {
  const today = localDate(new Date().toISOString());
  const [appointments, clients, services] = await Promise.all([
    getAppointments(tenantId),
    getClients(tenantId),
    getServices(tenantId),
  ]);

  const todayAppts = appointments.filter(
    (a) => localDate(a.startAt) === today && a.status !== 'cancelled',
  );

  return {
    todayCount: todayAppts.length,
    pendingCount: appointments.filter((a) => a.status === 'pending').length,
    clientsCount: clients.length,
    servicesCount: services.filter((s) => s.active).length,
    upcoming: appointments
      .filter((a) => a.status !== 'cancelled' && new Date(a.startAt).getTime() >= Date.now())
      .slice(0, 5)
      .map((a) => ({
        ...a,
        client: clients.find((c) => c.id === a.clientId) || null,
        service: services.find((s) => s.id === a.serviceId) || null,
        colorHex: APPOINTMENT_COLORS.find((c) => c.id === a.color)?.hex || '#e879a9',
      })),
  };
}
