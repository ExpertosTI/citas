import type { APIRoute } from 'astro';
import { tenantIdFromRequest } from '../../../lib/auth';
import { bad, json } from '../../../lib/http';
import { readLogo, saveLogo } from '../../../lib/logo';
import { getTenantById, updateTenant } from '../../../lib/store';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const tenantId = tenantIdFromRequest(request);
  if (!tenantId) return bad('No autenticado', 401);

  const tenant = await getTenantById(tenantId);
  if (!tenant) return bad('Sesión inválida', 401);

  const form = await request.formData();
  const file = form.get('logo');
  if (!(file instanceof File) || file.size === 0) return bad('Archivo requerido');

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const url = await saveLogo(tenantId, bytes, file.type || 'image/png');
    await updateTenant(tenantId, { logoUrl: url });
    return json({ ok: true, logoUrl: url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error';
    if (msg === 'too_large') return bad('Logo muy grande (máx 2MB)', 413);
    if (msg === 'invalid_type') return bad('Formato no válido (PNG, JPG, WEBP, SVG)', 400);
    return bad('No se pudo subir', 500);
  }
};
