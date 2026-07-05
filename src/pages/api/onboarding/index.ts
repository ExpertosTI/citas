import type { APIRoute } from 'astro';
import { tenantIdFromRequest } from '../../../lib/auth';
import { isGeminiConfigured } from '../../../lib/gemini';
import { bad, json, readBody } from '../../../lib/http';
import { rateLimit } from '../../../lib/security';
import {
  applyOnboardingSetup,
  chatOnboarding,
  chatOnboardingFallback,
  initialAssistantMessage,
  skipOnboarding,
  type AssistantMode,
  type ChatMessage,
  type OnboardingSetupDraft,
} from '../../../lib/onboarding-ai';
import { answerAppointmentQuery } from '../../../lib/assistant-queries';
import { bookAppointmentFromText } from '../../../lib/assistant-booking';
import { getServices, getTenantById, safeTenant } from '../../../lib/store';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const tenantId = tenantIdFromRequest(request);
  if (!tenantId) return bad('No autenticado', 401);

  const tenant = await getTenantById(tenantId);
  if (!tenant) return bad('Sesión inválida', 401);

  const url = new URL(request.url);
  const mode: AssistantMode = url.searchParams.get('mode') === 'assistant' ? 'assistant' : 'onboarding';

  return json({
    ok: true,
    geminiConfigured: isGeminiConfigured(),
    onboardingComplete: tenant.onboardingComplete === true,
    tenant: safeTenant(tenant),
    greeting: initialAssistantMessage(tenant, mode),
    mode,
  });
};

export const POST: APIRoute = async ({ request }) => {
  const tenantId = tenantIdFromRequest(request);
  if (!tenantId) return bad('No autenticado', 401);

  const body = await readBody<{
    action?: 'chat' | 'apply' | 'skip';
    mode?: AssistantMode;
    messages?: ChatMessage[];
    setup?: OnboardingSetupDraft;
  }>(request);

  const tenant = await getTenantById(tenantId);
  if (!tenant) return bad('Sesión inválida', 401);

  const mode: AssistantMode = body.mode === 'assistant' ? 'assistant' : 'onboarding';

  if (body.action === 'skip') {
    await skipOnboarding(tenantId);
    const updated = await getTenantById(tenantId);
    return json({ ok: true, tenant: safeTenant(updated!) });
  }

  if (body.action === 'apply') {
    if (!body.setup || !Object.keys(body.setup).length) {
      return bad('No hay configuración para aplicar');
    }
    const merge = mode === 'assistant' || tenant.onboardingComplete === true;
    const result = await applyOnboardingSetup(tenantId, body.setup, { merge });
    return json({
      ok: true,
      tenant: safeTenant(result.tenant!),
      services: result.services,
    });
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'user' || !last.content.trim()) {
    return bad('Mensaje requerido');
  }

  const existingServices = await getServices(tenantId);

  if (mode === 'assistant') {
    const bookingAnswer = await bookAppointmentFromText(tenantId, last.content);
    if (bookingAnswer) {
      return json({ ok: true, ...bookingAnswer, fallback: true });
    }

    const queryAnswer = await answerAppointmentQuery(tenantId, last.content);
    if (queryAnswer) {
      return json({ ok: true, ...queryAnswer, fallback: true });
    }
  }

  if (!isGeminiConfigured()) {
    const ai = chatOnboardingFallback(tenant, messages, {}, mode, existingServices);
    return json({ ok: true, ...ai, fallback: true });
  }

  const limited = rateLimit(`onboarding:chat:${tenantId}`, 60, 60 * 60_000);
  if (limited) return bad(limited, 429);

  try {
    const ai = await chatOnboarding(tenantId, messages, mode);
    return json({ ok: true, ...ai });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error';
    console.error('[onboarding/chat] request failed', msg);
    const ai = chatOnboardingFallback(tenant, messages, {}, mode, existingServices);
    return json({ ok: true, ...ai, fallback: true });
  }
};
