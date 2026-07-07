import type { APIRoute } from 'astro';
import { googleAuthUrl, isGoogleAuthConfigured } from '../../../../lib/google-auth';

export const prerender = false;

function loginRedirect(request: Request, error: string) {
  return Response.redirect(new URL(`/login?error=${error}`, request.url), 302);
}

export const GET: APIRoute = async ({ request }) => {
  if (!isGoogleAuthConfigured()) {
    return loginRedirect(request, 'google_unavailable');
  }

  const url = new URL(request.url);
  const mode = url.searchParams.get('mode') === 'register' ? 'register' : 'login';

  try {
    return Response.redirect(googleAuthUrl(mode), 302);
  } catch (err) {
    console.error('[auth/google]', err instanceof Error ? err.message : err);
    return loginRedirect(request, 'google_unavailable');
  }
};
