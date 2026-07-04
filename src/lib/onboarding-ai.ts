import { generateGeminiText, isGeminiConfigured } from './gemini';
import {
  APPOINTMENT_COLORS,
  type AppointmentColor,
  getServices,
  getTenantById,
  replaceTenantServices,
  updateTenant,
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
};

export type OnboardingAiResponse = {
  reply: string;
  setup?: OnboardingSetupDraft;
  readyToApply: boolean;
};

const SYSTEM_PROMPT = `Eres el asistente de onboarding de Citas, una plataforma profesional de reservas para barberías, salones, spas y centros de belleza en Latinoamérica.

Tu trabajo es guiar al dueño del negocio de forma clara y amigable, en español, para dejar su local listo en pocos minutos.

Pregunta de a poco (máximo 1-2 preguntas por mensaje):
1. Confirma o ajusta el nombre del negocio
2. Qué servicios ofrece y a qué precio (en moneda local)
3. Duración aproximada de cada servicio en minutos (si no la dice, infiere: corte 30-40, barba 20, combo 45)
4. Horario de apertura y cierre (ej. 9am a 8pm)
5. Si cierra al mediodía (almuerzo) y qué días descansa (ej. domingos)
6. Bio corta para su página pública (o genera una si no quiere pensar)
7. WhatsApp/Instagram si los menciona

Reglas:
- Sé breve, cálido y directo. Sin párrafos largos.
- Si el usuario da varios datos a la vez, acéptalos y pide solo lo que falte.
- Precios en números enteros (RD$, USD según moneda del tenant).
- closedWeekdays: 0=domingo, 1=lunes, ... 6=sábado
- Cuando tengas nombre + al menos 2 servicios con precio + horario, marca readyToApply=true
- En setup incluye TODO lo que hayas inferido o confirmado hasta ahora (acumulativo)
- reply: texto conversacional para el chat (sin JSON visible al usuario)
- Si el usuario dice "listo", "aplica", "ok", "dale" y ya tienes datos mínimos, readyToApply=true

Responde SOLO JSON válido con esta forma:
{
  "reply": "string",
  "setup": { ...campos opcionales... },
  "readyToApply": boolean
}`;

function tenantContext(tenant: Tenant, currency: string) {
  const services = ''; // filled async in chat function
  return {
    businessName: tenant.businessName,
    ownerName: tenant.ownerName,
    city: tenant.city,
    country: tenant.country,
    currency,
    phone: tenant.phone,
    currentBio: tenant.bio,
    currentHours: `${tenant.openHour}:00 – ${tenant.closeHour}:00`,
    closedWeekdays: tenant.closedWeekdays,
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

export async function chatOnboarding(
  tenantId: string,
  messages: ChatMessage[],
): Promise<OnboardingAiResponse> {
  if (!isGeminiConfigured()) throw new Error('gemini_not_configured');

  const tenant = await getTenantById(tenantId);
  if (!tenant) throw new Error('tenant_not_found');

  const existingServices = await getServices(tenantId);
  const ctx = {
    ...tenantContext(tenant, tenant.currency),
    existingServices: existingServices.map((s) => ({
      name: s.name,
      price: s.price,
      durationMin: s.durationMin,
    })),
  };

  const historyText = messages
    .map((m) => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.content}`)
    .join('\n');

  const prompt = `${SYSTEM_PROMPT}

Contexto del tenant (JSON):
${JSON.stringify(ctx, null, 2)}

Conversación hasta ahora:
${historyText || '(inicio — saluda y pregunta por el negocio)'}

Responde el siguiente turno del asistente en JSON.`;

  const text = await generateGeminiText(prompt, { json: true });
  return parseAiJson(text);
}

export async function applyOnboardingSetup(tenantId: string, setup: OnboardingSetupDraft) {
  const tenant = await getTenantById(tenantId);
  if (!tenant) throw new Error('tenant_not_found');

  const patch: Record<string, unknown> = { onboardingComplete: true };

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

  await updateTenant(tenantId, patch as never);

  if (setup.services?.length) {
    const services = setup.services
      .filter((s) => s.name?.trim() && Number(s.price) >= 0)
      .map((s, i) => ({
        name: s.name.trim(),
        price: Math.round(Number(s.price)),
        durationMin: Math.max(5, Math.round(Number(s.durationMin) || 30)),
        color: validColor(i),
        active: true,
      }));

    if (services.length) {
      await replaceTenantServices(tenantId, services);
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

export function initialAssistantMessage(tenant: Tenant) {
  return `Hola ${tenant.ownerName.split(' ')[0]}. Soy tu asistente de configuración.

Vamos a dejar **${tenant.businessName}** listo: servicios, precios, horario y colores de marca.

Para empezar, cuéntame qué servicios ofreces y a qué precio. Puedes decirlo todo junto, por ejemplo: "Corte 800, barba 400, color 2500".`;
}
