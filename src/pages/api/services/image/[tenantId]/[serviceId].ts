import type { APIRoute } from 'astro';
import { isValidTenantId } from '../../../../../lib/security';
import { readServiceImage } from '../../../../../lib/service-image';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const tenantId = params.tenantId || '';
  const serviceId = params.serviceId || '';
  if (!isValidTenantId(tenantId) || !serviceId) return new Response('Not found', { status: 404 });

  const image = await readServiceImage(tenantId, serviceId);
  if (!image) return new Response('Not found', { status: 404 });

  return new Response(image.bytes, {
    status: 200,
    headers: {
      'Content-Type': image.mime,
      'Cache-Control': 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
};
