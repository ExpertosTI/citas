import type { APIRoute } from 'astro';
import { tenantIdFromRequest } from '../../../lib/auth';
import { isGeminiConfigured } from '../../../lib/gemini';
import { bad, json, readBody } from '../../../lib/http';
import { rateLimit, rateLimitRequest } from '../../../lib/security';
import {
  applyOnboardingSetup,
  chatOnboarding,
  initialAssistantMessage,
  skipOnboarding,
  type ChatMessage,
  type OnboardingSetupDraft,
} from '../../../lib/onboarding-ai';
import { getTenantById, safeTenant } from '../../../lib/store';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const tenantId = tenantIdFromRequest(request);
  if (!tenantId) return bad('No autenticado', 401);

  const tenant = await getTenantById(tenantId);
  if (!tenant) return bad('Sesión inválida', 401);

  return json({
    ok: true,
    geminiConfigured: isGeminiConfigured(),
    onboardingComplete: tenant.onboardingComplete !== false,
    tenant: safeTenant(tenant),
    greeting: initialAssistantMessage(tenant),
  });
};

export const POST: APIRoute = async ({ request }) => {
  const tenantId = tenantIdFromRequest(request);
  if (!tenantId) return bad('No autenticado', 401);

  const body = await readBody<{
    action?: 'chat' | 'apply' | 'skip';
    messages?: ChatMessage[];
    setup?: OnboardingSetupDraft;
  }>(request);

  const tenant = await getTenantById(tenantId);
  if (!tenant) return bad('Sesión inválida', 401);

  if (body.action === 'skip') {
    await skipOnboarding(tenantId);
    const updated = await getTenantById(tenantId);
    return json({ ok: true, tenant: safeTenant(updated!) });
  }

  if (body.action === 'apply') {
    if (!body.setup || !Object.keys(body.setup).length) {
      return bad('No hay configuración para aplicar');
    }
    const result = await applyOnboardingSetup(tenantId, body.setup);
    return json({
      ok: true,
      tenant: safeTenant(result.tenant!),
      services: result.services,
    });
  }

  if (!isGeminiConfigured()) {
    return bad('Asistente AI no configurado', 503);
  }

  const limited = rateLimit(`onboarding:chat:${tenantId}`, 40, 60 * 60_000);
  if (limited) return bad(limited, 429);

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'user' || !last.content.trim()) {
    return bad('Mensaje requerido');
  }

  try {
    const ai = await chatOnboarding(tenantId, messages);
    return json({ ok: true, ...ai });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error';
    if (msg === 'gemini_not_configured') return bad('Asistente AI no configurado', 503);
    console.error('[onboarding/chat] request failed');
    return bad('El asistente no pudo responder. Intenta de nuevo.', 502);
  }
};
