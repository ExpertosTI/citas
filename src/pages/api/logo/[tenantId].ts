import type { APIRoute } from 'astro';
import { isValidTenantId } from '../../../lib/security';
import { readLogo } from '../../../lib/logo';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const tenantId = params.tenantId || '';
  if (!isValidTenantId(tenantId)) return new Response('Not found', { status: 404 });

  const logo = await readLogo(tenantId);
  if (!logo) return new Response('Not found', { status: 404 });

  return new Response(logo.bytes, {
    status: 200,
    headers: {
      'Content-Type': logo.mime,
      'Cache-Control': 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
};
