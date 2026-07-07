import { generateGeminiChat, generateGeminiText, isGeminiConfigured } from './gemini';
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
  city?: string;
  accentColor?: string;
  slug?: string;
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
  cards?: AssistantAppointmentCard[];
  phase?: string;
  suggestions?: string[];
  usedFallback?: boolean;
  geminiError?: string;
};

export type AssistantAppointmentCard = {
  id: string;
  clientName: string;
  serviceName: string;
  when: string;
  status: string;
  statusLabel: string;
  code: string;
  date: string;
  pending: boolean;
};

export type AssistantMode = 'onboarding' | 'assistant';

export function effectiveChatMode(tenant: Tenant, mode: AssistantMode): AssistantMode {
  if (mode === 'onboarding' && tenant.onboardingComplete === true) return 'assistant';
  return mode;
}

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

const ONBOARDING_PROMPT = `Eres el asistente de configuración de Citas — como Gemini, guías paso a paso al dueño de un barbería/salón/spa en Latinoamérica.

Estilo: español cálido, claro, 1-2 preguntas por turno. Celebra avances ("Perfecto", "Listo ese paso").

Fases (avanzar en orden, no saltar sin datos):
1. **Marca** — nombre del local, bio corta para la página pública
2. **Logo** — el usuario puede SUBIR PNG con el botón adjunto; confirma cuando lo suba y sugiere color de acento si aplica
3. **Servicios** — mínimo 2 servicios con precio y duración en moneda local. El usuario puede SUBIR FOTOS con el botón 📎 — asócialas al servicio correcto
4. **Horario** — apertura/cierre, almuerzo opcional, días cerrados
5. **Contacto** — WhatsApp, Instagram, dirección, teléfono
6. **Revisión** — resume todo y marca readyToApply=true

${SCHEDULE_RULES}

Campos setup: businessName, bio, phone, whatsapp, instagram, address, city, accentColor (#hex), services[], openHour, closeHour, lunchStartHour, lunchEndHour, closedWeekdays, slotBufferMin.

Cuando tengas logo (contexto hasLogo=true) + ≥2 servicios + horario + algún contacto → readyToApply=true.
Si dice "listo", "aplica", "dale" con datos mínimos → readyToApply=true.

Incluye en reply sugerencias concretas para el siguiente paso.
Responde SOLO JSON:
{"reply":"...","setup":{...},"readyToApply":boolean,"suggestions":["chip1","chip2"]}`;

const ASSISTANT_PROMPT = `Eres el asistente permanente de configuración y operación de Citas — como Gemini: cálido, natural, útil. Habla en español latino (RD, MX, CO), 2-4 frases máximo.

IMPORTANTE:
- Responde SIEMPRE al tono del usuario. Si saluda ("klk", "hola", "qué tal"), saluda de vuelta y pregunta en qué ayudar — NUNCA repitas un menú de opciones.
- Nunca suenes a menú robótico ni uses la misma frase genérica dos veces.
- Si el mensaje es informal o corto, sé breve y humano.

Capacidades:
1. **Agenda** — consultas (el servidor maneja agendar/consultar aparte)
2. **Configuración** — servicios, precios, horarios, bio, contacto, ciudad, color (#hex), nombre del local
3. **Fotos de servicios** — el usuario sube con 📎; si pide fotos sin adjuntar, explícale: tocar 📎, elegir imagen, escribir "foto del [servicio]"
4. **Logo** — subir PNG/JPG con 📎 (sin texto = logo del negocio)
5. **Limpieza** — "limpia servicios inválidos"

Si el usuario dice "fotos", "productos", "imágenes" o similar → guíalo a subir con 📎 y nombra servicios del catálogo (existingServices) que aún no tienen foto (hasPhoto=false).

${SCHEDULE_RULES}

Para cambios: incluye en setup SOLO lo que cambió este turno. removeServices para quitar.
NUNCA pongas frases de horario ni comandos en setup.services — solo nombres cortos de servicio.
Si el cambio es claro o dice "aplica"/"guarda" → readyToApply=true.

Responde SOLO JSON:
{"reply":"...","setup":{...},"readyToApply":boolean,"suggestions":["..."]}`;

function tenantContext(
  tenant: Tenant,
  services: Service[],
  appointments?: Array<{ code: string; status: string; startAt: string; clientName?: string; serviceName?: string }>,
  extras?: { hasLogo?: boolean; logoUrl?: string },
) {
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
    accentColor: tenant.accentColor,
    slug: tenant.slug,
    hasLogo: extras?.hasLogo ?? Boolean(tenant.logoUrl),
    logoUrl: extras?.logoUrl || tenant.logoUrl,
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
      hasPhoto: Boolean(s.imageUrl),
    })),
    appointments: appointments || [],
  };
}

function extractJsonObject(raw: string) {
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) return cleaned.slice(start, end + 1);
  return cleaned;
}

function parseAiJson(raw: string): OnboardingAiResponse {
  const cleaned = extractJsonObject(raw);
  const parsed = JSON.parse(cleaned) as OnboardingAiResponse;
  if (!parsed.reply || typeof parsed.reply !== 'string') {
    throw new Error('invalid_ai_response');
  }
  if (typeof parsed.readyToApply !== 'boolean') parsed.readyToApply = false;
  if (parsed.setup) parsed.setup = sanitizeSetupDraft(parsed.setup);
  return parsed;
}

function hasActionableHeuristics(text: string, existingServices: Service[]) {
  return (
    parseServicesHeuristic(text).length > 0 ||
    parseServiceUpdates(text, existingServices).length > 0 ||
    parseScheduleFromText(text).openHour !== undefined ||
    Boolean(parseContactHeuristic(text).bio) ||
    parseServiceRemovals(text, existingServices).length > 0 ||
    wantsApply(text) ||
    scheduleHasChange(text)
  );
}

function clampHour(n: unknown, fallback: number) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(24, Math.max(0, Math.round(v)));
}

function validColor(index: number): AppointmentColor {
  return APPOINTMENT_COLORS[index % APPOINTMENT_COLORS.length].id;
}

const SCHEDULE_WORDS =
  /(?:abro|abre|abrimos|cierro|cierra|cerramos|horario|almuerzo|domingo|lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|cerrado|descanso|fin de semana|mañana|noche|mediodia|mediodía)/i;

function isLikelyScheduleText(text: string) {
  const n = text.toLowerCase().trim();
  if (/(?:abro|abre|cierro|cierra|horario)\b/.test(n)) return true;
  if (parseScheduleFromText(text).openHour !== undefined) return true;
  if (/\d{1,2}\s*(?:am|pm|a\.?m\.?|p\.?m\.?)/i.test(text) && /(?:a|hasta|-|–)\s*\d{1,2}/i.test(text)) {
    return true;
  }
  return false;
}

export function isValidServiceName(name: string) {
  const n = name.trim();
  if (n.length < 2 || n.length > 32) return false;
  if (SCHEDULE_WORDS.test(n)) return false;
  if (/^\d+(\s+a)?$/i.test(n)) return false;
  if (/^(de|a|las|el|la|en|por|ponlo|ponle|cambiale|cambia)$/i.test(n)) return false;
  if (/(?:abro|abre|cierro|cierra|horario|precio|ponlo|cambiale)/i.test(n)) return false;
  if (n.split(/\s+/).length > 4) return false;
  return true;
}

function sanitizeServices(services?: OnboardingServiceDraft[]) {
  if (!services?.length) return services;
  return services.filter((s) => isValidServiceName(s.name) && Number(s.price) >= 0);
}

export function sanitizeSetupDraft(setup: OnboardingSetupDraft): OnboardingSetupDraft {
  return { ...setup, services: sanitizeServices(setup.services) };
}

function matchExistingService(rawName: string, existing: Service[]) {
  const key = rawName.toLowerCase().trim();
  return existing.find((s) => {
    const sn = s.name.toLowerCase();
    return sn === key || sn.includes(key) || key.includes(sn);
  });
}

function extractServiceFromText(text: string, existing: Service[]) {
  const n = text.toLowerCase();
  for (const s of [...existing].sort((a, b) => b.name.length - a.name.length)) {
    if (n.includes(s.name.toLowerCase())) return s;
  }
  return undefined;
}

export function parseServicesHeuristic(text: string) {
  if (isLikelyScheduleText(text)) return [];

  const services: OnboardingServiceDraft[] = [];
  const segments = text.split(/[,;\n]+/);
  for (const seg of segments) {
    const trimmed = seg.trim();
    if (isLikelyScheduleText(trimmed)) continue;
    const m = trimmed.match(/^(.+?)\s+(?:\$|rd\$)?\s*(\d+)(?:\s*,?\s*(\d+)\s*min)?\s*$/i);
    if (m) {
      const name = m[1].trim();
      const price = Number(m[2]);
      const duration = m[3] ? Number(m[3]) : /barba|ceja|uñ|pie|manic|pedic/i.test(name) ? 20 : 30;
      if (isValidServiceName(name) && price > 0) {
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
  if (isLikelyScheduleText(text)) return [];

  const patterns: Array<{ re: RegExp; generic?: boolean }> = [
    {
      re: /(?:cambia|cambiar|cambiale|actualiza)\s+(?:el\s+)?precio\s+(?:de|del|a)?\s*(.+?)\s+(?:a|en|por|ponlo en)\s+(?:rd\$|\$)?\s*(\d+)/i,
    },
    {
      re: /(?:cambia|cambiale)\s+(?:el|la)?\s*(.+?)\s+(?:a|en|por|ponlo en)\s+(?:rd\$|\$)?\s*(\d+)/i,
    },
    {
      re: /(?:sube|baja|pon|ponle|ponlo)\s+(?:el|la|los|las)?\s*(.+?)\s+(?:a|en|por)\s+(?:rd\$|\$)?\s*(\d+)/i,
    },
    {
      re: /(?:agrega|añade|anade|nuevo|nueva|crea|crear)\s+(?:servicio|producto)?\s*(.+?)\s+(?:rd\$|\$)?\s*(\d+)(?:\s*,?\s*(\d+)\s*min)?/i,
    },
    {
      re: /^(.+?)\s+(?:a|por)\s+(?:rd\$|\$)?\s*(\d+)(?:\s*,?\s*(\d+)\s*min)?\s*$/i,
      generic: true,
    },
  ];

  for (const { re, generic } of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const rawName = m[1].trim();
    const price = Number(m[2]);
    const duration = m[3] ? Number(m[3]) : undefined;
    if (price <= 0) continue;

    const match = matchExistingService(rawName, existing) || extractServiceFromText(text, existing);
    const name = match?.name || rawName.charAt(0).toUpperCase() + rawName.slice(1);
    if (!isValidServiceName(name)) continue;
    if (generic && !match && rawName.split(/\s+/).length > 2) continue;

    return [
      {
        name,
        price,
        durationMin: duration || match?.durationMin || 30,
      },
    ];
  }

  return [];
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

function parseChipIntent(text: string) {
  const n = text.toLowerCase().trim();
  if (/agregar otro servicio|nuevo servicio|otro servicio/.test(n)) {
    return 'add_service' as const;
  }
  if (/cambiar un precio|cambiar precio|actualizar precio/.test(n)) {
    return 'change_price' as const;
  }
  if (/ayud|otras cosas|qué puedes|que puedes|qué más|que mas/.test(n)) {
    return 'help' as const;
  }
  return null;
}

function buildAssistantStyleReply(
  tenant: Tenant,
  setup: OnboardingSetupDraft,
  existingServices: Service[],
  lastText: string,
  hasChanges: boolean,
) {
  if (wantsApply(lastText) && hasChanges) {
    return { reply: 'Perfecto. Pulsa **Aplicar cambios** para guardar.', readyToApply: true };
  }
  if (setup.removeServices?.length) {
    return {
      reply: `Quitaré **${setup.removeServices.join(', ')}**. Pulsa **Aplicar cambios**.`,
      readyToApply: true,
    };
  }
  const updates = parseServiceUpdates(lastText, existingServices);
  if (updates.length) {
    const u = updates[0];
    return {
      reply: `Actualizo **${u.name}** a ${tenant.currency === 'DOP' ? 'RD$' : '$'}${u.price}. Pulsa **Aplicar cambios**.`,
      readyToApply: true,
    };
  }
  if (scheduleHasChange(lastText)) {
    return { reply: formatScheduleReply(setup), readyToApply: true };
  }
  if (parseServicesHeuristic(lastText).length) {
    const added = parseServicesHeuristic(lastText);
    return {
      reply: `Anoté **${added.map((s) => s.name).join(', ')}**. Pulsa **Aplicar cambios** para guardar.`,
      readyToApply: true,
    };
  }
  if (hasChanges) {
    return { reply: summarizeSetup(setup, tenant, existingServices) + ' Pulsa **Aplicar cambios**.', readyToApply: true };
  }

  const intent = parseChipIntent(lastText);
  if (intent === 'add_service') {
    return {
      reply: 'Claro. Dime **nombre, precio y duración** — ej: "Tinte 3500, 90 min" o "Agrega mechas 2800, 60 min".',
      readyToApply: false,
    };
  }
  if (intent === 'change_price') {
    const names = existingServices.map((s) => s.name).join(', ') || 'tus servicios';
    return {
      reply: `¿Qué servicio y a qué precio? Tienes: **${names}**. Ej: "Sube el corte a 700".`,
      readyToApply: false,
    };
  }
  if (intent === 'help') {
    return {
      reply: `Te ayudo con lo que necesites:
• **Servicios** — agregar, precios, quitar
• **Fotos** — toca 📎 y escribe "foto del Corte" (o el servicio)
• **Horario** — apertura, almuerzo, días cerrados
• **Logo y contacto** — WhatsApp, Instagram, dirección

¿Qué ajustamos?`,
      readyToApply: false,
    };
  }

  const casual = /^(klk|que lo que|qué lo que|hola|hey|buenas|buen dia|buenos dias|hi|hello|qué tal|que tal)\b/i.test(
    lastText.trim(),
  );
  if (casual) {
    const first = tenant.ownerName.split(' ')[0];
    return {
      reply: `¡Klk ${first}! 👋 Todo bien por aquí. ¿Qué movemos — servicios, horario, fotos o la agenda?`,
      readyToApply: false,
    };
  }

  return {
    reply: `Dime qué necesitas y lo hacemos — servicios, fotos 📎, horario o contacto.`,
    readyToApply: false,
  };
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

  const chatMode = effectiveChatMode(tenant, mode);
  let reply: string;
  let readyToApply = false;

  if (chatMode === 'assistant') {
    const styled = buildAssistantStyleReply(tenant, setup, existingServices, lastText, hasChanges);
    reply = styled.reply;
    readyToApply = styled.readyToApply;
  } else {
    if (svcCount === 0) {
      reply = `Cuéntame servicios y precios — ej: "Corte 500, Pies 700, Cejas 1200".`;
    } else if (!hasHours) {
      reply = `Anoté ${(setup.services || existingServices.map((s) => ({ name: s.name, price: s.price }))).map((s) => `**${s.name}** ${s.price}`).join(', ')}. ¿Horario? Ej: "9am a 8pm, cerrado domingos" o "de 9 a 20".`;
    } else if (hasChanges || wantsApply(lastText)) {
      readyToApply = true;
      reply = summarizeSetup(setup, tenant, existingServices) + ' Pulsa **Aplicar y abrir bahía**.';
    } else if (svcCount >= 2 && hasHours) {
      const intent = parseChipIntent(lastText);
      if (intent) {
        const styled = buildAssistantStyleReply(tenant, setup, existingServices, lastText, false);
        reply = styled.reply;
        readyToApply = styled.readyToApply;
      } else {
        reply = `Tienes servicios y horario listos. ¿Quieres cambiar algo más o pulsar **Aplicar y abrir bahía**?`;
      }
    } else {
      reply = `Anoté ${(setup.services || []).map((s) => s.name).join(', ') || existingServices.map((s) => s.name).join(', ')}. ¿Algún servicio más u horario?`;
    }
  }

  return { reply, setup: sanitizeSetupDraft(setup), readyToApply };
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
    parts.push(`almuerzo ${formatHour(setup.lunchStartHour)}–${formatHour(setup.lunchEndHour)}`);
  }
  if (setup.closedWeekdays?.length) {
    parts.push(`cierra **${weekdayLabels(setup.closedWeekdays)}**`);
  }
  return `${parts.join(', ')}. Pulsa **Aplicar cambios**.`;
}

function summarizeSetup(setup: OnboardingSetupDraft, tenant: Tenant, existingServices: Service[] = []) {
  const cur = tenant.currency === 'DOP' ? 'RD$' : tenant.currency === 'USD' ? 'USD ' : '';
  const list = setup.services?.length
    ? setup.services
    : existingServices.map((s) => ({ name: s.name, price: s.price }));
  const svcs = list.map((s) => `${s.name} ${cur}${s.price}`).join(', ') || 'sin cambios de servicios';
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
  priorSetup: OnboardingSetupDraft = {},
): Promise<OnboardingAiResponse> {
  if (!isGeminiConfigured()) throw new Error('gemini_not_configured');

  const tenant = await getTenantById(tenantId);
  if (!tenant) throw new Error('tenant_not_found');

  const existingServices = await getServices(tenantId);
  const chatMode = effectiveChatMode(tenant, mode);
  let apptCtx: Array<{ code: string; status: string; startAt: string; clientName?: string; serviceName?: string }> = [];
  if (chatMode === 'assistant') {
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
  const ctx = tenantContext(tenant, existingServices, apptCtx, {
    hasLogo: Boolean(tenant.logoUrl),
    logoUrl: tenant.logoUrl,
  });
  const systemPrompt = chatMode === 'assistant' ? ASSISTANT_PROMPT : ONBOARDING_PROMPT;
  const systemInstruction = `${systemPrompt}

Contexto del negocio (JSON):
${JSON.stringify(ctx, null, 2)}

Borrador acumulado (JSON):
${JSON.stringify(priorSetup, null, 2)}`;

  const turns = messages.map((m) => ({
    role: (m.role === 'user' ? 'user' : 'model') as 'user' | 'model',
    text: m.content,
  }));

  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content || '';

  async function callGemini(json: boolean) {
    const text = await generateGeminiChat(systemInstruction, turns, { json, temperature: json ? 0.65 : 0.8 });
    return parseAiJson(text);
  }

  let lastErr = 'gemini_failed';
  try {
    return await callGemini(true);
  } catch (err) {
    lastErr = err instanceof Error ? err.message : 'gemini_failed';
    console.error('[onboarding/gemini]', lastErr);
  }

  try {
    return await callGemini(false);
  } catch (err) {
    lastErr = err instanceof Error ? err.message : lastErr;
    console.error('[onboarding/gemini-plain]', lastErr);
  }

  if (hasActionableHeuristics(lastUser, existingServices)) {
    const prior =
      Object.keys(priorSetup).length > 0
        ? priorSetup
        : messages.length > 1
          ? chatOnboardingFallback(tenant, messages.slice(0, -1), priorSetup, mode, existingServices).setup || {}
          : {};
    const local = chatOnboardingFallback(tenant, messages, prior, mode, existingServices);
    return { ...local, usedFallback: true, geminiError: lastErr };
  }

  throw new Error(lastErr);
}

export async function applyOnboardingSetup(
  tenantId: string,
  setup: OnboardingSetupDraft,
  opts: { merge?: boolean } = {},
) {
  const tenant = await getTenantById(tenantId);
  if (!tenant) throw new Error('tenant_not_found');

  const merge = opts.merge ?? tenant.onboardingComplete === true;
  const patch: Record<string, unknown> = {};

  if (!merge || tenant.onboardingComplete !== true) {
    patch.onboardingComplete = true;
  }

  if (setup.businessName?.trim()) patch.businessName = setup.businessName.trim();
  if (setup.bio?.trim()) patch.bio = setup.bio.trim();
  if (setup.phone?.trim()) patch.phone = setup.phone.trim();
  if (setup.whatsapp?.trim()) patch.whatsapp = setup.whatsapp.trim();
  if (setup.instagram?.trim()) patch.instagram = setup.instagram.replace(/^@/, '');
  if (setup.address?.trim()) patch.address = setup.address.trim();
  if (setup.city?.trim()) patch.city = setup.city.trim();
  if (setup.accentColor?.trim() && /^#[0-9a-fA-F]{6}$/.test(setup.accentColor.trim())) {
    patch.accentColor = setup.accentColor.trim();
  }
  if (setup.slug?.trim()) patch.slug = setup.slug.trim().toLowerCase();
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
    const existing = await getServices(tenantId);
    const items = sanitizeServices(setup.services)!
      .map((s) => {
        const key = s.name.trim().toLowerCase();
        const match =
          existing.find((ex) => ex.name.toLowerCase() === key) ||
          existing.find((ex) => {
            const sn = ex.name.toLowerCase();
            return sn.includes(key) || key.includes(sn);
          });
        return {
          name: match?.name || s.name.trim(),
          price: Math.round(Number(s.price)),
          durationMin: Math.max(5, Math.round(Number(s.durationMin) || match?.durationMin || 30)),
        };
      })
      .filter((s) => isValidServiceName(s.name) && Number(s.price) >= 0)
      .map((s, i) => ({
        name: s.name,
        price: s.price,
        durationMin: s.durationMin,
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
  return tenant.onboardingComplete !== true;
}

export function initialAssistantMessage(tenant: Tenant, mode: AssistantMode = 'onboarding') {
  const first = tenant.ownerName.split(' ')[0];
  if (mode === 'assistant') {
    return `Hola ${first} 👋 ¿En qué te ayudo?

Puedo ajustar **servicios**, subir **fotos** 📎, **horario**, **logo** o ver tu **agenda**.

Escribe lo que necesites o toca una sugerencia.`;
  }
  return `Hola ${first}. Armemos **${tenant.businessName}** juntos — paso a paso.

**Paso 1 · Marca** — cuéntame en una frase qué hace tu negocio.
Luego sube tu **logo PNG** (botón 📎), servicios con precios, horario y contacto.

Cuando todo esté listo, aplicamos y abres tu bahía.`;
}
