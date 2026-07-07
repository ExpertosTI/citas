import type { APIRoute } from 'astro';
import { tenantIdFromRequest } from '../../../../lib/auth';
import { bad, json } from '../../../../lib/http';
import { isGeminiConfigured, matchServiceFromImage } from '../../../../lib/gemini';
import { getServices, saveService } from '../../../../lib/store';
import { saveServiceImage } from '../../../../lib/service-image';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const tenantId = tenantIdFromRequest(request);
  if (!tenantId) return bad('No autenticado', 401);

  const form = await request.formData();
  const file = form.get('image');
  const serviceId = String(form.get('serviceId') || '').trim();
  const hint = String(form.get('hint') || '').trim();

  if (!(file instanceof File) || file.size === 0) return bad('Imagen requerida');

  const services = await getServices(tenantId);
  let target = serviceId ? services.find((s) => s.id === serviceId) : null;

  try {
    const bytes = Buffer.from(await file.arrayBuffer());

    if (!target && isGeminiConfigured()) {
      const names = services.map((s) => s.name);
      const match = await matchServiceFromImage(bytes.toString('base64'), file.type || 'image/jpeg', names, hint);
      if (match.serviceName) {
        target = services.find((s) => s.name === match.serviceName) || null;
      }
    }

    if (!target) {
      const byHint = hint
        ? services.find((s) => {
            const key = s.name.toLowerCase();
            const h = hint.toLowerCase();
            return key === h || key.includes(h) || h.includes(key);
          })
        : null;
      target = byHint || null;
    }

    if (!target) return bad('Indica a qué servicio pertenece la foto (ej. "Corte")', 400);

    const url = await saveServiceImage(tenantId, target.id, bytes, file.type || 'image/jpeg');
    const service = await saveService(tenantId, { id: target.id, name: target.name, imageUrl: url });
    return json({ ok: true, service, imageUrl: url, serviceName: target.name });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error';
    if (msg === 'too_large') return bad('Imagen muy grande (máx 2MB)', 413);
    if (msg === 'invalid_type') return bad('Formato no válido (PNG, JPG, WEBP)', 400);
    return bad('No se pudo subir la foto', 500);
  }
};
