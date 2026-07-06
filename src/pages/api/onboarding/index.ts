import type { APIRoute } from 'astro';
import { tenantIdFromRequest } from '../../../lib/auth';
import { analyzeLogoImage, isGeminiConfigured } from '../../../lib/gemini';
import { bad, json, readBody } from '../../../lib/http';
import { readLogo } from '../../../lib/logo';
import { rateLimit } from '../../../lib/security';
import {
  applyOnboardingSetup,
  chatOnboarding,
  chatOnboardingFallback,
  initialAssistantMessage,
  skipOnboarding,
  type AssistantMode,
  type ChatMessage,
  type OnboardingAiResponse,
  type OnboardingSetupDraft,
} from '../../../lib/onboarding-ai';
import { answerAppointmentQuery } from '../../../lib/assistant-queries';
import { bookAppointmentFromText } from '../../../lib/assistant-booking';
import {
  computeSetupPhase,
  assistantSuggestions,
  phaseSuggestions,
  publicLogoPreview,
  SETUP_PHASES,
} from '../../../lib/setup-phases';
import { getServices, getTenantById, safeTenant, updateTenant } from '../../../lib/store';

export const prerender = false;

function enrichResponse(
  tenant: NonNullable<Awaited<ReturnType<typeof getTenantById>>>,
  draft: OnboardingSetupDraft,
  ai: OnboardingAiResponse,
  mode: AssistantMode,
  opts: { logoUploaded?: boolean; serviceCount?: number } = {},
) {
  const phase = computeSetupPhase(tenant, draft, {
    readyToApply: ai.readyToApply,
    logoUploaded: opts.logoUploaded,
    serviceCount: opts.serviceCount,
  });
  const currency = tenant.currency === 'DOP' ? 'RD$' : tenant.currency;
  const useAssistantSuggestions = mode === 'assistant' && tenant.onboardingComplete === true;
  return {
    ...ai,
    phase,
    suggestions: ai.suggestions?.length
      ? ai.suggestions
      : useAssistantSuggestions
        ? assistantSuggestions(tenant, currency)
        : phaseSuggestions(phase, tenant, currency, mode),
    logoUrl: publicLogoPreview(tenant),
    phases: SETUP_PHASES,
  };
}

async function handleLogoUploaded(tenantId: string) {
  const tenant = await getTenantById(tenantId);
  if (!tenant) throw new Error('tenant_not_found');

  const setup: OnboardingSetupDraft = {};
  let styleNote = '';

  const logo = await readLogo(tenantId);
  if (logo && isGeminiConfigured()) {
    try {
      const analysis = await analyzeLogoImage(logo.bytes.toString('base64'), logo.mime);
      if (analysis?.accentColor) {
        setup.accentColor = analysis.accentColor;
        await updateTenant(tenantId, { accentColor: analysis.accentColor } as never);
        styleNote = analysis.note ? ` ${analysis.note}` : '';
      }
    } catch (err) {
      console.error('[onboarding/logo]', err);
    }
  }

  const updated = await getTenantById(tenantId);
  const services = await getServices(tenantId);
  const reply = setup.accentColor
    ? `¡Logo guardado! Ya aparece en tu página de reservas. Detecté un estilo con acento **${setup.accentColor}** — lo apliqué.${styleNote}\n\nSiguiente: cuéntame tus **servicios y precios**.`
    : `¡Logo guardado! Ya está en tu página pública.\n\nSiguiente: cuéntame tus **servicios y precios** — ej. "Corte 500, Barba 300".`;

  const ai: OnboardingAiResponse = {
    reply,
    setup,
    readyToApply: false,
    suggestions: phaseSuggestions('services', updated!, updated!.currency === 'DOP' ? 'RD$' : updated!.currency),
  };

  return enrichResponse(updated!, setup, ai, 'onboarding', {
    logoUploaded: true,
    serviceCount: services.filter((s) => s.active).length,
  });
}

export const GET: APIRoute = async ({ request }) => {
  const tenantId = tenantIdFromRequest(request);
  if (!tenantId) return bad('No autenticado', 401);

  const tenant = await getTenantById(tenantId);
  if (!tenant) return bad('Sesión inválida', 401);

  const url = new URL(request.url);
  const mode: AssistantMode = url.searchParams.get('mode') === 'assistant' ? 'assistant' : 'onboarding';
  const services = await getServices(tenantId);
  const serviceCount = services.filter((s) => s.active).length;
  const phase = computeSetupPhase(tenant, {}, { serviceCount });
  const currency = tenant.currency === 'DOP' ? 'RD$' : tenant.currency;
  const useAssistantSuggestions = mode === 'assistant' && tenant.onboardingComplete === true;

  return json({
    ok: true,
    geminiConfigured: isGeminiConfigured(),
    onboardingComplete: tenant.onboardingComplete === true,
    tenant: safeTenant(tenant),
    greeting: initialAssistantMessage(tenant, mode),
    mode,
    phase,
    phases: SETUP_PHASES,
    suggestions: useAssistantSuggestions
      ? assistantSuggestions(tenant, currency)
      : phaseSuggestions(phase, tenant, currency, mode),
    logoUrl: publicLogoPreview(tenant),
    serviceCount,
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
    logoJustUploaded?: boolean;
  }>(request);

  const tenant = await getTenantById(tenantId);
  if (!tenant) return bad('Sesión inválida', 401);

  const mode: AssistantMode = body.mode === 'assistant' ? 'assistant' : 'onboarding';
  const existingServices = await getServices(tenantId);
  const serviceCount = existingServices.filter((s) => s.active).length;

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

  if (body.logoJustUploaded) {
    const payload = await handleLogoUploaded(tenantId);
    return json({ ok: true, ...payload, fallback: true });
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'user' || !last.content.trim()) {
    return bad('Mensaje requerido');
  }

  if (mode === 'assistant') {
    const bookingAnswer = await bookAppointmentFromText(tenantId, last.content);
    if (bookingAnswer) {
      return json({
        ok: true,
        ...enrichResponse(tenant, {}, bookingAnswer, mode, { serviceCount }),
        fallback: true,
      });
    }

    const queryAnswer = await answerAppointmentQuery(tenantId, last.content);
    if (queryAnswer) {
      return json({
        ok: true,
        ...enrichResponse(tenant, {}, queryAnswer, mode, { serviceCount }),
        fallback: true,
      });
    }
  }

  if (!isGeminiConfigured()) {
    const ai = chatOnboardingFallback(tenant, messages, {}, mode, existingServices);
    return json({
      ok: true,
      ...enrichResponse(tenant, ai.setup || {}, ai, mode, { serviceCount }),
      fallback: true,
    });
  }

  const limited = rateLimit(`onboarding:chat:${tenantId}`, 60, 60 * 60_000);
  if (limited) return bad(limited, 429);

  try {
    const ai = await chatOnboarding(tenantId, messages, mode);
    return json({
      ok: true,
      ...enrichResponse(tenant, ai.setup || {}, ai, mode, { serviceCount }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error';
    console.error('[onboarding/chat] request failed', msg);
    const ai = chatOnboardingFallback(tenant, messages, {}, mode, existingServices);
    return json({
      ok: true,
      ...enrichResponse(tenant, ai.setup || {}, ai, mode, { serviceCount }),
      fallback: true,
    });
  }
};
