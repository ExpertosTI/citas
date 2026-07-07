import type { APIRoute } from 'astro';
import { googleAuthUrl, isGoogleAuthConfigured } from '../../../../lib/google-auth';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  if (!isGoogleAuthConfigured()) {
    return new Response('Google Sign-In no configurado', { status: 503 });
  }

  const url = new URL(request.url);
  const mode = url.searchParams.get('mode') === 'register' ? 'register' : 'login';

  try {
    return Response.redirect(googleAuthUrl(mode), 302);
  } catch {
    return new Response('Google Sign-In no disponible', { status: 503 });
  }
};
