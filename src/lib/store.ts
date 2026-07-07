import { promises as fs } from 'node:fs';
import path from 'node:path';
import { hashPassword, newId, slugify } from './auth';
import { countryPreset } from './geo';
import { normalizePhoneDigits } from './phone';
import { googlePasswordHash } from './google-auth';
import type { TenantModuleState } from './modules/types';
import { normalizeSubscription, type TenantSubscription } from './subscription';
import { appointmentCode, normalizeTenant } from './tenant';
import { dayBoundsUtc, localDateKey, tenantTimezone, zonedDateTime } from './tz';

const DATA_DIR = process.env.CITAS_DATA_DIR || path.join(process.cwd(), 'data');

export const APPOINTMENT_COLORS = [
  { id: 'gold', hex: '#e8b923', label: 'Oro' },
  { id: 'steel', hex: '#64748b', label: 'Acero' },
  { id: 'amber', hex: '#f59e0b', label: 'Ámbar' },
  { id: 'crimson', hex: '#dc2626', label: 'Rojo' },
  { id: 'teal', hex: '#14b8a6', label: 'Verde azul' },
  { id: 'navy', hex: '#1e3a5f', label: 'Marino' },
  { id: 'olive', hex: '#65a30d', label: 'Oliva' },
  { id: 'charcoal', hex: '#374151', label: 'Carbón' },
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
  country: string;
  currency: string;
  bio: string;
  accentColor: string;
  logoUrl: string;
  timezone: string;
  openHour: number;
  closeHour: number;
  lunchStartHour: number;
  lunchEndHour: number;
  slotBufferMin: number;
  closedDays: string[];
  closedWeekdays: number[];
  instagram: string;
  whatsapp: string;
  onboardingComplete?: boolean;
  modules?: Record<string, TenantModuleState>;
  subscription?: TenantSubscription;
  createdAt: string;
};

export type Service = {
  id: string;
  tenantId: string;
  name: string;
  durationMin: number;
  price: number;
  pricingMode?: 'fixed' | 'quote';
  color: AppointmentColor;
  active: boolean;
  imageUrl?: string;
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

export type AppointmentStatus =
  | 'pending'
  | 'confirmed'
  | 'received'
  | 'completed'
  | 'invoiced'
  | 'cancelled'
  | 'no_show';

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
  haircutStyle?: string;
  source: 'dashboard' | 'public';
  code: string;
  cancelReason?: string;
  createdAt: string;
  reminderSentAt?: string | null;
};

export type WaitlistEntry = {
  id: string;
  tenantId: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  serviceId: string;
  preferredDate: string;
  notes?: string;
  createdAt: string;
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
    { id: newId('svc'), tenantId, name: 'Corte clásico', durationMin: 30, price: 500, color: 'gold', active: true },
    { id: newId('svc'), tenantId, name: 'Fade / Degradé', durationMin: 40, price: 700, color: 'steel', active: true },
    { id: newId('svc'), tenantId, name: 'Barba', durationMin: 20, price: 350, color: 'charcoal', active: true },
    { id: newId('svc'), tenantId, name: 'Corte + barba', durationMin: 45, price: 900, color: 'amber', active: true },
    { id: newId('svc'), tenantId, name: 'Diseño / Línea', durationMin: 25, price: 400, color: 'crimson', active: true },
  ];
}

export function publicTenant(t: Tenant): PublicTenant {
  const { passwordHash: _, email: __, ...rest } = normalizeTenant(t);
  return rest;
}

export function safeTenant(t: Tenant) {
  const { passwordHash: _, ...rest } = normalizeTenant(t);
  return rest;
}

export async function getTenants(): Promise<Tenant[]> {
  return readJson<Tenant[]>('tenants.json', []);
}

export async function getTenantById(id: string) {
  const tenants = await getTenants();
  const t = tenants.find((x) => x.id === id);
  return t ? normalizeTenant(t) : null;
}

export async function getTenantBySlug(slug: string) {
  const tenants = await getTenants();
  const t = tenants.find((x) => x.slug === slug);
  return t ? normalizeTenant(t) : null;
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
  country?: string;
  slug?: string;
}) {
  const tenants = await getTenants();
  const email = input.email.trim().toLowerCase();
  if (tenants.some((t) => t.email === email)) {
    throw new Error('email_taken');
  }

  let base = slugify(input.slug || input.businessName) || 'barberia';
  let slug = base;
  let n = 1;
  while (tenants.some((t) => t.slug === slug)) {
    slug = `${base}-${n++}`;
  }

  const preset = countryPreset(input.country || 'DO');

  const tenant: Tenant = normalizeTenant({
    id: newId('ten'),
    slug,
    businessName: input.businessName.trim(),
    ownerName: input.ownerName.trim(),
    email,
    passwordHash: hashPassword(input.password),
    phone: (input.phone || '').trim(),
    address: '',
    city: (input.city || preset.city).trim(),
    country: preset.code,
    currency: preset.currency,
    bio: 'Reserva tu cita en línea · Servicio profesional',
    accentColor: '#e8b923',
    logoUrl: '',
    timezone: preset.timezone,
    openHour: 9,
    closeHour: 20,
    lunchStartHour: 13,
    lunchEndHour: 14,
    slotBufferMin: 5,
    closedDays: [],
    closedWeekdays: [0],
    instagram: '',
    whatsapp: (input.phone || '').trim(),
    onboardingComplete: false,
    createdAt: new Date().toISOString(),
  });

  tenants.push(tenant);
  await writeJson('tenants.json', tenants);

  const services = await getAllServices();
  services.push(...defaultServices(tenant.id));
  await writeJson('services.json', services);

  return tenant;
}

export async function createTenantFromGoogle(input: {
  email: string;
  ownerName: string;
  googleSub: string;
  country?: string;
  city?: string;
}) {
  const tenants = await getTenants();
  const email = input.email.trim().toLowerCase();
  if (tenants.some((t) => t.email === email)) {
    throw new Error('email_taken');
  }

  const first = input.ownerName.trim().split(/\s+/)[0] || 'Mi';
  const businessName = `Local de ${first}`;

  let base = slugify(businessName) || 'negocio';
  let slug = base;
  let n = 1;
  while (tenants.some((t) => t.slug === slug)) {
    slug = `${base}-${n++}`;
  }

  const preset = countryPreset(input.country || 'DO');

  const tenant: Tenant = normalizeTenant({
    id: newId('ten'),
    slug,
    businessName,
    ownerName: input.ownerName.trim(),
    email,
    passwordHash: googlePasswordHash(input.googleSub),
    phone: '',
    address: '',
    city: (input.city || preset.city).trim(),
    country: preset.code,
    currency: preset.currency,
    bio: 'Reserva tu cita en línea · Servicio profesional',
    accentColor: '#e8b923',
    logoUrl: '',
    timezone: preset.timezone,
    openHour: 9,
    closeHour: 20,
    lunchStartHour: 13,
    lunchEndHour: 14,
    slotBufferMin: 5,
    closedDays: [],
    closedWeekdays: [0],
    instagram: '',
    whatsapp: '',
    onboardingComplete: false,
    createdAt: new Date().toISOString(),
  });

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

  tenants[idx] = normalizeTenant({ ...next, ...patch } as Tenant);
  await writeJson('tenants.json', tenants);
  return tenants[idx];
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
      pricingMode: input.pricingMode ?? all[idx].pricingMode ?? 'fixed',
      color: (input.color || all[idx].color) as AppointmentColor,
      active: input.active ?? all[idx].active,
      imageUrl: input.imageUrl !== undefined ? input.imageUrl : all[idx].imageUrl,
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
    pricingMode: input.pricingMode === 'quote' ? 'quote' : 'fixed',
    color: (input.color || 'gold') as AppointmentColor,
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

export async function replaceTenantServices(
  tenantId: string,
  items: Array<{ name: string; durationMin: number; price: number; pricingMode?: 'fixed' | 'quote'; color: AppointmentColor; active?: boolean; imageUrl?: string }>,
) {
  const all = await getAllServices();
  const existing = all.filter((s) => s.tenantId === tenantId);
  const kept = all.filter((s) => s.tenantId !== tenantId);
  const next = items.map((item) => {
    const prev = existing.find((s) => s.name.toLowerCase() === item.name.trim().toLowerCase());
    return {
      id: prev?.id || newId('svc'),
      tenantId,
      name: item.name.trim(),
      durationMin: item.durationMin,
      price: item.price,
      pricingMode: item.pricingMode ?? prev?.pricingMode ?? 'fixed',
      color: item.color,
      active: item.active ?? true,
      imageUrl: item.imageUrl ?? prev?.imageUrl,
    };
  });
  await writeJson('services.json', [...kept, ...next]);
  return next;
}

export async function mergeTenantServices(
  tenantId: string,
  items: Array<{ name: string; durationMin: number; price: number; pricingMode?: 'fixed' | 'quote'; color?: AppointmentColor; active?: boolean; imageUrl?: string }>,
) {
  const all = await getAllServices();
  const existing = all.filter((s) => s.tenantId === tenantId);
  const others = all.filter((s) => s.tenantId !== tenantId);

  const merged = existing.map((s) => ({ ...s }));

  for (const item of items) {
    const key = item.name.trim().toLowerCase();
    const idx = merged.findIndex((s) => s.name.toLowerCase() === key);
    if (idx >= 0) {
      merged[idx] = {
        ...merged[idx],
        name: item.name.trim(),
        price: item.price,
        durationMin: item.durationMin,
        color: item.color || merged[idx].color,
        pricingMode: item.pricingMode ?? merged[idx].pricingMode ?? 'fixed',
        active: item.active ?? merged[idx].active,
        imageUrl: item.imageUrl ?? merged[idx].imageUrl,
      };
    } else {
      merged.push({
        id: newId('svc'),
        tenantId,
        name: item.name.trim(),
        durationMin: item.durationMin,
        price: item.price,
        pricingMode: item.pricingMode === 'quote' ? 'quote' : 'fixed',
        color: item.color || 'gold',
        active: item.active ?? true,
      });
    }
  }

  await writeJson('services.json', [...others, ...merged]);
  return merged;
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
  const tenant = await getTenantById(tenantId);
  const country = tenant?.country || 'DO';
  const email = (input.email || '').trim().toLowerCase();
  const phone = input.phone ? normalizePhoneDigits(input.phone, country) : '';
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
  const tenant = await getTenantById(tenantId);
  const country = tenant?.country || 'DO';
  const phoneNorm = input.phone ? normalizePhoneDigits(input.phone, country) : '';
  if (input.id) {
    const idx = all.findIndex((c) => c.id === input.id && c.tenantId === tenantId);
    if (idx < 0) return null;
    all[idx] = {
      ...all[idx],
      name: input.name.trim(),
      email: (input.email || all[idx].email || '').trim().toLowerCase(),
      phone: phoneNorm || all[idx].phone || '',
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
    phone: phoneNorm,
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

function validAppointment(a: Appointment) {
  return Boolean(a?.startAt && a?.endAt);
}

export async function getAppointments(tenantId: string, from?: string, to?: string) {
  const all = await getAllAppointments();
  return all
    .filter((a) => a.tenantId === tenantId && validAppointment(a))
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
    haircutStyle?: string;
  },
) {
  const tenant = await getTenantById(tenantId);
  if (!tenant) throw new Error('tenant_not_found');

  const services = await getServices(tenantId);
  const service = services.find((s) => s.id === input.serviceId);
  if (!service) throw new Error('service_not_found');

  const clients = await getClients(tenantId);
  const client = clients.find((c) => c.id === input.clientId);
  if (!client) throw new Error('client_not_found');

  const start = new Date(input.startAt);
  if (!Number.isFinite(start.getTime())) throw new Error('invalid_start');
  const end = new Date(start.getTime() + service.durationMin * 60_000);

  const tz = tenantTimezone(tenant);
  const dayKey = localDateKey(start.toISOString(), tz);
  const { from, to } = dayBoundsUtc(dayKey, tz);
  const buffer = tenant.slotBufferMin ?? 5;

  const existing = await getAppointments(tenantId, from, to);
  const conflict = existing.some((a) => {
    if (a.status === 'cancelled') return false;
    const aStart = new Date(a.startAt).getTime() - buffer * 60_000;
    const aEnd = new Date(a.endAt).getTime() + buffer * 60_000;
    return overlaps(start.getTime(), end.getTime(), aStart, aEnd);
  });
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
    haircutStyle: input.haircutStyle,
    source: input.source || 'dashboard',
    code: appointmentCode(),
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
  patch: Partial<
    Pick<
      Appointment,
      'status' | 'notes' | 'color' | 'startAt' | 'endAt' | 'reminderSentAt' | 'cancelReason' | 'haircutStyle'
    >
  >,
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
  const day = String(dateIso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return {
      date: day || '',
      tenant: null,
      appointments: [],
      services: [],
      clients: [],
      colors: APPOINTMENT_COLORS,
      range: { from: '', to: '' },
    };
  }

  const tenant = await getTenantById(tenantId);
  const tz = tenantTimezone(tenant || {});
  const { from, to } = dayBoundsUtc(day, tz);
  const appointments = await getAppointments(tenantId, from, to);

  const dayAppts = appointments.filter((a) => localDateKey(a.startAt!, tz) === day);
  const [services, clients] = await Promise.all([getServices(tenantId), getClients(tenantId)]);

  const enriched = dayAppts.map((a) => ({
    ...a,
    client: clients.find((c) => c.id === a.clientId) || null,
    service: services.find((s) => s.id === a.serviceId) || null,
    colorHex: APPOINTMENT_COLORS.find((c) => c.id === a.color)?.hex || '#e8b923',
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
    pendingList: appointments
      .filter((a) => a.status === 'pending')
      .sort((a, b) => a.startAt.localeCompare(b.startAt))
      .map((a) => ({
        ...a,
        client: clients.find((c) => c.id === a.clientId) || null,
        service: services.find((s) => s.id === a.serviceId) || null,
      })),
    clientsCount: clients.length,
    servicesCount: services.filter((s) => s.active).length,
    upcoming: appointments
      .filter((a) => a.status !== 'cancelled' && new Date(a.startAt).getTime() >= Date.now())
      .slice(0, 5)
      .map((a) => ({
        ...a,
        client: clients.find((c) => c.id === a.clientId) || null,
        service: services.find((s) => s.id === a.serviceId) || null,
        colorHex: APPOINTMENT_COLORS.find((c) => c.id === a.color)?.hex || '#e8b923',
      })),
    weekRevenue: appointments
      .filter((a) => {
        const t = new Date(a.startAt).getTime();
        const weekAgo = Date.now() - 7 * 86400_000;
        return t >= weekAgo && (a.status === 'completed' || a.status === 'invoiced');
      })
      .reduce((sum, a) => {
        const svc = services.find((s) => s.id === a.serviceId);
        return sum + (svc?.pricingMode === 'quote' ? 0 : (svc?.price || 0));
      }, 0),
    noShowCount: appointments.filter((a) => a.status === 'no_show').length,
    waitlistCount: (await getWaitlist(tenantId)).length,
  };
}

async function getAllWaitlist() {
  return readJson<WaitlistEntry[]>('waitlist.json', []);
}

export async function getWaitlist(tenantId: string) {
  const all = await getAllWaitlist();
  return all.filter((w) => w.tenantId === tenantId);
}

export async function addWaitlistEntry(
  tenantId: string,
  input: {
    clientName: string;
    clientPhone?: string;
    clientEmail?: string;
    serviceId: string;
    preferredDate: string;
    notes?: string;
  },
) {
  const tenant = await getTenantById(tenantId);
  const country = tenant?.country || 'DO';
  const entry: WaitlistEntry = {
    id: newId('wl'),
    tenantId,
    clientName: input.clientName.trim(),
    clientPhone: input.clientPhone ? normalizePhoneDigits(input.clientPhone, country) : '',
    clientEmail: (input.clientEmail || '').trim().toLowerCase(),
    serviceId: input.serviceId,
    preferredDate: input.preferredDate.slice(0, 10),
    notes: input.notes,
    createdAt: new Date().toISOString(),
  };
  const all = await getAllWaitlist();
  all.unshift(entry);
  await writeJson('waitlist.json', all.slice(0, 2000));
  return entry;
}

export async function removeWaitlistEntry(tenantId: string, id: string) {
  const all = await getAllWaitlist();
  const next = all.filter((w) => !(w.id === id && w.tenantId === tenantId));
  await writeJson('waitlist.json', next);
  return next.length < all.length;
}

export async function getClientHistory(tenantId: string, clientId: string) {
  const [appointments, clients, services] = await Promise.all([
    getAppointments(tenantId),
    getClients(tenantId),
    getServices(tenantId),
  ]);
  const client = clients.find((c) => c.id === clientId);
  if (!client) return null;
  const history = appointments
    .filter((a) => a.clientId === clientId)
    .sort((a, b) => b.startAt.localeCompare(a.startAt))
    .map((a) => ({
      ...a,
      service: services.find((s) => s.id === a.serviceId) || null,
      colorHex: APPOINTMENT_COLORS.find((c) => c.id === a.color)?.hex || '#e8b923',
    }));
  return { client, history };
}

export async function getBoardWeek(tenantId: string, startDate: string) {
  const base = String(startDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(base)) return [];
  const start = new Date(`${base}T00:00:00`);
  const days: { date: string; count: number; revenue: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const key = localDate(d.toISOString());
    const board = await getBoardDay(tenantId, key);
    const active = board.appointments.filter((a) => a.status !== 'cancelled');
    days.push({
      date: key,
      count: active.length,
      revenue: active.reduce((s, a) => s + (a.service?.pricingMode === 'quote' ? 0 : (a.service?.price || 0)), 0),
    });
  }
  return days;
}
