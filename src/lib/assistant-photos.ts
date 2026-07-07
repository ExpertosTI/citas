import type { OnboardingAiResponse } from './onboarding-ai';
import { getServices } from './store';

function norm(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function isServicePhotoRequest(text: string) {
  const n = norm(text);
  if (!n) return false;
  if (/^logo\b|logo del negocio|logo de la marca/.test(n) && !/servicio|producto/.test(n)) return false;
  return /foto|fotos|imagen|imagenes|producto|productos|catalogo|portada|miniatura|subir.*foto|cambiar.*foto|foto de|foto del|foto de la/.test(
    n,
  );
}

export function isLogoPhotoRequest(text: string) {
  const n = norm(text);
  return /logo|marca visual|imagen del negocio/.test(n) && !/servicio|producto|corte|barba|tinte/.test(n);
}

function matchServiceName(text: string, names: string[]) {
  const n = norm(text);
  let best: string | null = null;
  let bestLen = 0;
  for (const name of names) {
    const key = norm(name);
    if (n.includes(key) && key.length > bestLen) {
      best = name;
      bestLen = key.length;
    }
  }
  return best;
}

export async function answerServicePhotoRequest(tenantId: string, text: string): Promise<OnboardingAiResponse> {
  const services = (await getServices(tenantId)).filter((s) => s.active);
  const names = services.map((s) => s.name);
  const matched = matchServiceName(text, names);
  const without = services.filter((s) => !s.imageUrl);
  const withPhoto = services.filter((s) => s.imageUrl);

  if (matched) {
    return {
      reply: `Perfecto — para la foto de **${matched}**, toca **📎**, elige la imagen y envía. Si quieres, escribe "foto de ${matched}" antes de subirla.`,
      readyToApply: false,
      suggestions: [`Foto de ${matched}`, ...without.filter((s) => s.name !== matched).slice(0, 2).map((s) => `Foto de ${s.name}`)],
    };
  }

  if (!services.length) {
    return {
      reply: 'Primero agrega servicios al catálogo (ej. "Corte 500, 30 min") y luego subimos las fotos con **📎**.',
      readyToApply: false,
      suggestions: ['Agrega tinte 3500, 90 min', 'Agregar otro servicio'],
    };
  }

  if (!without.length) {
    return {
      reply: `Todos tus servicios ya tienen foto. Para cambiar una, toca **📎**, escribe el nombre (ej. "foto del ${services[0].name}") y sube la imagen nueva.`,
      readyToApply: false,
      suggestions: services.slice(0, 4).map((s) => `Foto de ${s.name}`),
    };
  }

  const pending = without.map((s) => `**${s.name}**`).join(', ');
  const done = withPhoto.length ? ` Con foto: ${withPhoto.map((s) => s.name).join(', ')}.` : '';

  return {
    reply: `¡Vamos con las fotos! Toca **📎**, elige la imagen y dime a qué servicio va — por ejemplo "foto del Corte".\n\nFaltan foto: ${pending}.${done}`,
    readyToApply: false,
    suggestions: without.slice(0, 4).map((s) => `Foto de ${s.name}`),
  };
}

export async function answerLogoPhotoRequest(): Promise<OnboardingAiResponse> {
  return {
    reply: 'Para el **logo**, toca **📎**, elige tu imagen (PNG, JPG o WEBP) y envía. Si el cuadro de texto está vacío, lo tomamos como logo del negocio.',
    readyToApply: false,
    suggestions: ['Fotos de servicios 📎', 'Cambiar horario', 'Citas de hoy'],
  };
}
