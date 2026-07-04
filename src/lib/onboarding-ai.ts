import { generateGeminiText, isGeminiConfigured } from './gemini';
import { formatHour, parseScheduleFromText, weekdayLabels } from './schedule-parser';
import {
  APPOINTMENT_COLORS,
  type AppointmentColor,
  getAppointments,
  getClients,
  getServices,
  getTenantById,
  mergeTenantServices,
  replaceTenantServices,
  updateTenant,
  type Service,
  type Tenant,
} from './store';

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type OnboardingServiceDraft = {
  name: string;
  price: number;
  durationMin: number;
};

export type OnboardingSetupDraft = {
  businessName?: string;
  bio?: string;
  phone?: string;
  whatsapp?: string;
  instagram?: string;
  address?: string;
  openHour?: number;
  closeHour?: number;
  lunchStartHour?: number;
  lunchEndHour?: number;
  slotBufferMin?: number;
  closedWeekdays?: number[];
  services?: OnboardingServiceDraft[];
  removeServices?: string[];
};

export type OnboardingAiResponse = {
  reply: string;
  setup?: OnboardingSetupDraft;
  readyToApply: boolean;
};

export type AssistantMode = 'onboarding' | 'assistant';

const SCHEDULE_RULES = `
Horarios — interpreta lenguaje natural en español:
- "9 a 8" / "9am a 8pm" / "de 9 de la mañana a 8 de la noche" → openHour/closeHour (24h)
- "9:00 - 20:00" → openHour 9, closeHour 20
- "almuerzo 12 a 2" / "cierra al mediodía de 12 a 1" → lunchStartHour, lunchEndHour
- "cerrado domingos" / "descanso los domingos" → closedWeekdays: [0]
- "lunes a sábado" abierto → closedWeekdays: [0]
- "fin de semana cerrado" → closedWeekdays: [0, 6]
- closedWeekdays: 0=domingo, 1=lunes, 2=martes, 3=miércoles, 4=jueves, 5=viernes, 6=sábado

Servicios — cambios parciales:
- "sube el corte a 600" → actualiza solo ese servicio en setup.services
- "agrega tinte 3500, 90 min" → añade servicio
- "quita el servicio de pies" → removeServices: ["Pies"]
- Siempre incluye en setup SOLO lo que cambió en este turno (el servidor hace merge)
`;

const ONBOARDING_PROMPT = `Eres el asistente de configuración de Citas para barberías, salones y spas en Latinoamérica.

Guía al dueño en español, breve y cálido. Máximo 1-2 preguntas por mensaje.

Flujo inicial:
1. Servicios y precios (moneda local)
2. Horario apertura/cierre, almuerzo, días cerrados
3. Bio, WhatsApp, Instagram si aplica

${SCHEDULE_RULES}

Cuando tengas ≥2 servicios con precio + horario completo → readyToApply=true.
Si dice "listo", "aplica", "dale" y hay datos mínimos → readyToApply=true.

Responde SOLO JSON:
{"reply":"...","setup":{...},"readyToApply":boolean}`;

const ASSISTANT_PROMPT = `Eres el asistente permanente de Citas. El negocio YA está configurado.

Dos modos:
1. **Consultas de agenda** — usa appointments del contexto: pendientes, hoy, próximas, resumen. readyToApply=false, setup vacío.
2. **Cambios de configuración** — servicios, precios, horarios, etc.

Puedes modificar: servicios/precios/duración, horarios, almuerzo, días cerrados, bio, teléfono, WhatsApp, Instagram, dirección, nombre del local.

${SCHEDULE_RULES}

Reglas:
- Usa los servicios actuales del contexto como referencia
- Para cambiar un precio: incluye el servicio con nombre exacto o similar y nuevo precio
- Para agregar: incluye servicio nuevo en setup.services
- Para quitar: usa removeServices con el nombre
- Si el cambio es claro → readyToApply=true de inmediato
- Si dice "aplica", "guarda", "listo" → readyToApply=true
- reply: confirma qué vas a cambiar, sin JSON visible

Responde SOLO JSON:
{"reply":"...","setup":{...},"readyToApply":boolean}`;

function tenantContext(tenant: Tenant, services: Service[], appointments?: Array<{ code: string; status: string; startAt: string; clientName?: string; serviceName?: string }>) {
  return {
    businessName: tenant.businessName,
    ownerName: tenant.ownerName,
    city: tenant.city,
    country: tenant.country,
    currency: tenant.currency,
    phone: tenant.phone,
    whatsapp: tenant.whatsapp,
    instagram: tenant.instagram,
    address: tenant.address,
    bio: tenant.bio,
    openHour: tenant.openHour,
    closeHour: tenant.closeHour,
    lunchStartHour: tenant.lunchStartHour,
    lunchEndHour: tenant.lunchEndHour,
    closedWeekdays: tenant.closedWeekdays,
    slotBufferMin: tenant.slotBufferMin,
    existingServices: services.map((s) => ({
      name: s.name,
      price: s.price,
      durationMin: s.durationMin,
    })),
    appointments: appointments || [],
  };
}

function parseAiJson(raw: string): OnboardingAiResponse {
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  const parsed = JSON.parse(cleaned) as OnboardingAiResponse;
  if (!parsed.reply || typeof parsed.readyToApply !== 'boolean') {
    throw new Error('invalid_ai_response');
  }
  return parsed;
}

function clampHour(n: unknown, fallback: number) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(24, Math.max(0, Math.round(v)));
}

function validColor(index: number): AppointmentColor {
  return APPOINTMENT_COLORS[index % APPOINTMENT_COLORS.length].id;
}

export function parseServicesHeuristic(text: string) {
  const services: OnboardingServiceDraft[] = [];
  const segments = text.split(/[,;\n]+/);
  for (const seg of segments) {
    const trimmed = seg.trim();
    const m = trimmed.match(/^(.+?)\s+(?:\$|rd\$)?\s*(\d+)(?:\s*,?\s*(\d+)\s*min)?\s*$/i);
    if (m) {
      const name = m[1].trim();
      const price = Number(m[2]);
      const duration = m[3] ? Number(m[3]) : /barba|ceja|uñ|pie|manic|pedic/i.test(name) ? 20 : 30;
      if (name.length >= 2 && price > 0) {
        services.push({
          name: name.charAt(0).toUpperCase() + name.slice(1),
          price,
          durationMin: duration,
        });
      }
    }
  }
  return services;
}

function parseServiceUpdates(text: string, existing: Service[]): OnboardingServiceDraft[] {
  const updates: OnboardingServiceDraft[] = [];

  const patterns = [
    /(?:sube|baja|cambia|actualiza|pon|precio\s+de)\s+(?:el|la|los|las)?\s*(.+?)\s+(?:a|en|por)\s+(?:rd\$|\$)?\s*(\d+)(?:\s*,?\s*(\d+)\s*min)?/i,
    /(?:agrega|añade|nuevo|nueva)\s+(.+?)\s+(?:rd\$|\$)?\s*(\d+)(?:\s*,?\s*(\d+)\s*min)?/i,
    /^(.+?)\s+(?:a|por)\s+(?:rd\$|\$)?\s*(\d+)(?:\s*,?\s*(\d+)\s*min)?\s*$/i,
  ];

  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const rawName = m[1].trim();
    const price = Number(m[2]);
    const duration = m[3] ? Number(m[3]) : undefined;
    if (price <= 0) continue;

    const match = existing.find(
      (s) =>
        s.name.toLowerCase().includes(rawName.toLowerCase()) ||
        rawName.toLowerCase().includes(s.name.toLowerCase()),
    );
    const name = match?.name || rawName.charAt(0).toUpperCase() + rawName.slice(1);
    updates.push({
      name,
      price,
      durationMin: duration || match?.durationMin || 30,
    });
    break;
  }

  return updates;
}

function parseServiceRemovals(text: string, existing: Service[]): string[] {
  const n = text.toLowerCase();
  if (!/(quita|elimina|borra|remueve|ya no|sin)\s/.test(n)) return [];

  for (const s of existing) {
    const key = s.name.toLowerCase();
    if (n.includes(key) || n.includes(key.slice(0, 4))) {
      return [s.name];
    }
  }

  const m = text.match(/(?:quita|elimina|borra|remueve)\s+(?:el|la|los|las|servicio\s+de)?\s*(.+)/i);
  if (m) return [m[1].trim()];
  return [];
}

function parseContactHeuristic(text: string): Partial<OnboardingSetupDraft> {
  const patch: Partial<OnboardingSetupDraft> = {};
  const wa = text.match(/(?:whatsapp|wa)\s*[:\s]?\s*(\+?\d[\d\s-]{7,})/i);
  if (wa) patch.whatsapp = wa[1].replace(/\D/g, '');

  const ig = text.match(/(?:instagram|ig)\s*[:\s]?\s@?([\w.]+)/i);
  if (ig) patch.instagram = ig[1];

  const phone = text.match(/(?:tel[eé]fono|tel|cel)\s*[:\s]?\s*(\+?\d[\d\s-]{7,})/i);
  if (phone) patch.phone = phone[1].replace(/\D/g, '');

  if (/^bio\s*[:\s]/i.test(text) || text.length > 40 && !/\d{3}/.test(text)) {
    const bio = text.replace(/^bio\s*[:\s]/i, '').trim();
    if (bio.length > 10) patch.bio = bio;
  }

  return patch;
}

function wantsApply(text: string) {
  return /^(aplica|guarda|listo|dale|ok|confirmar|hazlo|sí|si)$/i.test(text.trim());
}

export function chatOnboardingFallback(
  tenant: Tenant,
  messages: ChatMessage[],
  priorSetup: OnboardingSetupDraft = {},
  mode: AssistantMode = 'onboarding',
  existingServices: Service[] = [],
): OnboardingAiResponse {
  const userTexts = messages.filter((m) => m.role === 'user').map((m) => m.content);
  const lastText = userTexts[userTexts.length - 1] || '';

  let setup: OnboardingSetupDraft = {
    ...priorSetup,
    businessName: priorSetup.businessName || tenant.businessName,
    services: [...(priorSetup.services || [])],
    closedWeekdays: priorSetup.closedWeekdays || [...(tenant.closedWeekdays || [])],
    openHour: priorSetup.openHour ?? tenant.openHour,
    closeHour: priorSetup.closeHour ?? tenant.closeHour,
    lunchStartHour: priorSetup.lunchStartHour ?? tenant.lunchStartHour,
    lunchEndHour: priorSetup.lunchEndHour ?? tenant.lunchEndHour,
  };

  for (const text of userTexts) {
    const services = parseServicesHeuristic(text);
    const updates = parseServiceUpdates(text, existingServices);
    const schedule = parseScheduleFromText(text);
    const contact = parseContactHeuristic(text);
    const removals = parseServiceRemovals(text, existingServices);

    if (services.length) {
      const merged = mode === 'assistant' ? [...existingServices.map(s => ({ name: s.name, price: s.price, durationMin: s.durationMin }))] : [...(setup.services || [])];
      for (const s of services) {
        const idx = merged.findIndex((x) => x.name.toLowerCase() === s.name.toLowerCase());
        if (idx >= 0) merged[idx] = s;
        else merged.push(s);
      }
      setup.services = merged;
    }

    if (updates.length) {
      const merged = [...(setup.services || existingServices.map(s => ({ name: s.name, price: s.price, durationMin: s.durationMin })))];
      for (const u of updates) {
        const idx = merged.findIndex((x) => x.name.toLowerCase() === u.name.toLowerCase());
        if (idx >= 0) merged[idx] = { ...merged[idx], ...u };
        else merged.push(u);
      }
      setup.services = merged;
    }

    if (removals.length) setup.removeServices = [...(setup.removeServices || []), ...removals];

    if (schedule.openHour !== undefined) setup.openHour = schedule.openHour;
    if (schedule.closeHour !== undefined) setup.closeHour = schedule.closeHour;
    if (schedule.lunchStartHour !== undefined) setup.lunchStartHour = schedule.lunchStartHour;
    if (schedule.lunchEndHour !== undefined) setup.lunchEndHour = schedule.lunchEndHour;
    if (schedule.closedWeekdays?.length) setup.closedWeekdays = schedule.closedWeekdays;

    Object.assign(setup, contact);
  }

  const svcCount = setup.services?.length || existingServices.length;
  const hasHours = setup.openHour !== undefined && setup.closeHour !== undefined;
  const hasChanges = userTexts.some((t) =>
    parseServicesHeuristic(t).length ||
    parseServiceUpdates(t, existingServices).length ||
    parseScheduleFromText(t).openHour !== undefined ||
    parseContactHeuristic(t).bio ||
    parseServiceRemovals(t, existingServices).length,
  );

  let reply: string;
  let readyToApply = false;

  if (mode === 'assistant') {
    if (wantsApply(lastText) && hasChanges) {
      readyToApply = true;
      reply = 'Perfecto. Pulsa **Aplicar cambios** para guardar.';
    } else if (setup.removeServices?.length) {
      readyToApply = true;
      reply = `Quitaré **${setup.removeServices.join(', ')}**. Pulsa **Aplicar cambios**.`;
    } else if (setup.services?.length && parseServiceUpdates(lastText, existingServices).length) {
      const u = parseServiceUpdates(lastText, existingServices)[0];
      readyToApply = true;
      reply = `Actualizo **${u.name}** a ${tenant.currency === 'DOP' ? 'RD$' : '$'}${u.price}. ¿Aplico?`;
    } else if (scheduleHasChange(lastText)) {
      readyToApply = true;
      reply = formatScheduleReply(setup);
    } else if (hasChanges) {
      readyToApply = true;
      reply = summarizeSetup(setup, tenant);
    } else {
      reply = `Puedo cambiar servicios, precios, horarios y más. Ejemplos:
• "Sube el corte a 600"
• "Abre de 9am a 9pm, cerrado domingos"
• "Almuerzo de 12 a 2"
• "Agrega tinte 3500, 90 min"`;
    }
  } else {
    if (svcCount === 0) {
      reply = `Cuéntame servicios y precios — ej: "Corte 500, Pies 700, Cejas 1200".`;
    } else if (!hasHours) {
      reply = `Anoté ${setup.services!.map((s) => `**${s.name}** ${s.price}`).join(', ')}. ¿Horario? Ej: "9am a 8pm, cerrado domingos" o "de 9 a 20".`;
    } else if (svcCount >= 2 && hasHours) {
      readyToApply = true;
      reply = summarizeSetup(setup, tenant) + ' Pulsa **Aplicar y abrir bahía**.';
    } else {
      reply = `Anoté ${setup.services!.map((s) => s.name).join(', ')}. ¿Algún servicio más u horario?`;
    }
    if (wantsApply(lastText) && svcCount >= 1 && hasHours) readyToApply = true;
  }

  return { reply, setup, readyToApply };
}

function scheduleHasChange(text: string) {
  const s = parseScheduleFromText(text);
  return s.openHour !== undefined || s.closedWeekdays?.length || s.lunchStartHour !== undefined;
}

function formatScheduleReply(setup: OnboardingSetupDraft) {
  const parts: string[] = [];
  if (setup.openHour !== undefined && setup.closeHour !== undefined) {
    parts.push(`Horario **${formatHour(setup.openHour)} – ${formatHour(setup.closeHour)}**`);
  }
  if (setup.lunchStartHour !== undefined && setup.lunchEndHour !== undefined) {
    parts.push(`almuerzo ${setup.lunchStartHour}:00–${setup.lunchEndHour}:00`);
  }
  if (setup.closedWeekdays?.length) {
    parts.push(`cierra **${weekdayLabels(setup.closedWeekdays)}**`);
  }
  return `${parts.join(', ')}. Pulsa **Aplicar cambios**.`;
}

function summarizeSetup(setup: OnboardingSetupDraft, tenant: Tenant) {
  const cur = tenant.currency === 'DOP' ? 'RD$' : tenant.currency === 'USD' ? 'USD ' : '';
  const svcs = setup.services?.map((s) => `${s.name} ${cur}${s.price}`).join(', ') || '';
  const hrs =
    setup.openHour !== undefined && setup.closeHour !== undefined
      ? `${formatHour(setup.openHour!)}–${formatHour(setup.closeHour!)}`
      : '';
  return `Listo: ${svcs}${hrs ? ` · ${hrs}` : ''}.`;
}

export async function chatOnboarding(
  tenantId: string,
  messages: ChatMessage[],
  mode: AssistantMode = 'onboarding',
): Promise<OnboardingAiResponse> {
  if (!isGeminiConfigured()) throw new Error('gemini_not_configured');

  const tenant = await getTenantById(tenantId);
  if (!tenant) throw new Error('tenant_not_found');

  const existingServices = await getServices(tenantId);
  let apptCtx: Array<{ code: string; status: string; startAt: string; clientName?: string; serviceName?: string }> = [];
  if (mode === 'assistant') {
    const [appointments, clients] = await Promise.all([
      getAppointments(tenantId),
      getClients(tenantId),
    ]);
    apptCtx = appointments
      .filter((a) => a.status !== 'cancelled')
      .sort((a, b) => a.startAt.localeCompare(b.startAt))
      .slice(0, 30)
      .map((a) => ({
        code: a.code,
        status: a.status,
        startAt: a.startAt,
        clientName: clients.find((c) => c.id === a.clientId)?.name,
        serviceName: existingServices.find((s) => s.id === a.serviceId)?.name,
      }));
  }
  const ctx = tenantContext(tenant, existingServices, apptCtx);
  const systemPrompt = mode === 'assistant' ? ASSISTANT_PROMPT : ONBOARDING_PROMPT;

  const historyText = messages
    .map((m) => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.content}`)
    .join('\n');

  const prompt = `${systemPrompt}

Contexto actual (JSON):
${JSON.stringify(ctx, null, 2)}

Conversación:
${historyText || '(inicio)'}

Responde el siguiente turno en JSON.`;

  try {
    const text = await generateGeminiText(prompt, { json: true });
    return parseAiJson(text);
  } catch {
    const prior = messages.length > 1 ? chatOnboardingFallback(tenant, messages.slice(0, -1), {}, mode, existingServices).setup : {};
    return chatOnboardingFallback(tenant, messages, prior, mode, existingServices);
  }
}

export async function applyOnboardingSetup(
  tenantId: string,
  setup: OnboardingSetupDraft,
  opts: { merge?: boolean } = {},
) {
  const tenant = await getTenantById(tenantId);
  if (!tenant) throw new Error('tenant_not_found');

  const merge = opts.merge ?? tenant.onboardingComplete !== false;
  const patch: Record<string, unknown> = {};

  if (!merge || tenant.onboardingComplete === false) {
    patch.onboardingComplete = true;
  }

  if (setup.businessName?.trim()) patch.businessName = setup.businessName.trim();
  if (setup.bio?.trim()) patch.bio = setup.bio.trim();
  if (setup.phone?.trim()) patch.phone = setup.phone.trim();
  if (setup.whatsapp?.trim()) patch.whatsapp = setup.whatsapp.trim();
  if (setup.instagram?.trim()) patch.instagram = setup.instagram.replace(/^@/, '');
  if (setup.address?.trim()) patch.address = setup.address.trim();
  if (setup.openHour !== undefined) patch.openHour = clampHour(setup.openHour, tenant.openHour);
  if (setup.closeHour !== undefined) patch.closeHour = clampHour(setup.closeHour, tenant.closeHour);
  if (setup.lunchStartHour !== undefined) patch.lunchStartHour = clampHour(setup.lunchStartHour, tenant.lunchStartHour);
  if (setup.lunchEndHour !== undefined) patch.lunchEndHour = clampHour(setup.lunchEndHour, tenant.lunchEndHour);
  if (setup.slotBufferMin !== undefined) patch.slotBufferMin = Math.max(0, Number(setup.slotBufferMin) || 5);
  if (setup.closedWeekdays?.length) {
    patch.closedWeekdays = setup.closedWeekdays.filter((d) => d >= 0 && d <= 6);
  }

  if (Object.keys(patch).length) {
    await updateTenant(tenantId, patch as never);
  }

  if (setup.removeServices?.length) {
    const all = await getServices(tenantId);
    const removeKeys = setup.removeServices.map((n) => n.toLowerCase());
    const kept = all.filter(
      (s) => !removeKeys.some((k) => s.name.toLowerCase().includes(k) || k.includes(s.name.toLowerCase())),
    );
    if (kept.length !== all.length) {
      await replaceTenantServices(
        tenantId,
        kept.map((s) => ({
          name: s.name,
          price: s.price,
          durationMin: s.durationMin,
          color: s.color,
          active: s.active,
        })),
      );
    }
  }

  if (setup.services?.length) {
    const items = setup.services
      .filter((s) => s.name?.trim() && Number(s.price) >= 0)
      .map((s, i) => ({
        name: s.name.trim(),
        price: Math.round(Number(s.price)),
        durationMin: Math.max(5, Math.round(Number(s.durationMin) || 30)),
        color: validColor(i),
        active: true,
      }));

    if (items.length) {
      if (merge) {
        await mergeTenantServices(tenantId, items);
      } else {
        await replaceTenantServices(tenantId, items);
      }
    }
  }

  const updated = await getTenantById(tenantId);
  const services = await getServices(tenantId);
  return { tenant: updated, services };
}

export async function skipOnboarding(tenantId: string) {
  return updateTenant(tenantId, { onboardingComplete: true } as never);
}

export function needsOnboarding(tenant: Tenant) {
  return tenant.onboardingComplete === false;
}

export function initialAssistantMessage(tenant: Tenant, mode: AssistantMode = 'onboarding') {
  const first = tenant.ownerName.split(' ')[0];
  if (mode === 'assistant') {
    return `Hola ${first}. Soy tu asistente — siempre disponible.

Puedo **consultar tu agenda** o **cambiar configuración**.

Agenda:
• "¿Cuáles citas tengo pendientes?"
• "Citas de hoy"
• "Próximas citas"

Configuración:
• "Sube el corte a 600"
• "Abre de 10am a 9pm, cerrado domingos"
• "Agrega tinte 3500, 90 min"

¿Qué necesitas?`;
  }
  return `Hola ${first}. Vamos a dejar **${tenant.businessName}** listo.

Cuéntame servicios y precios — ej: "Corte 800, barba 400, color 2500".
Luego el horario: "9am a 8pm, cerrado domingos".`;
}
