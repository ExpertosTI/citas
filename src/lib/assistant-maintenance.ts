import type { OnboardingAiResponse } from './onboarding-ai';
import { isValidServiceName } from './onboarding-ai';
import { deleteService, getServices } from './store';

export function isCleanupServicesRequest(text: string) {
  return /limpia(?:r)?\s+(?:los\s+)?servicios(?:\s+inv[aá]lidos)?|borra(?:r)?\s+servicios(?:\s+(?:basura|inv[aá]lidos|rotos|malos))?|quita(?:r)?\s+servicios\s+inv[aá]lidos|servicios\s+inv[aá]lidos/i.test(
    text.trim(),
  );
}

export async function cleanupInvalidServices(tenantId: string): Promise<OnboardingAiResponse> {
  const services = await getServices(tenantId);
  const invalid = services.filter((s) => !isValidServiceName(s.name));

  if (!invalid.length) {
    return {
      reply: 'Revisé tu catálogo y **no hay servicios inválidos**. Todo se ve bien.',
      readyToApply: false,
      suggestions: ['Sube el corte a 700', 'Agrega tinte 3500, 90 min'],
    };
  }

  for (const s of invalid) {
    await deleteService(tenantId, s.id);
  }

  const names = invalid.map((s) => `**${s.name}**`).join(', ');
  return {
    reply: `Listo. Eliminé **${invalid.length}** servicio(s) inválido(s): ${names}.`,
    readyToApply: false,
    suggestions: ['Agrega tinte 3500, 90 min', 'Citas de hoy'],
  };
}
