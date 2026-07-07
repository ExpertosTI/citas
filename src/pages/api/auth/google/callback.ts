import type { APIRoute } from 'astro';
import { createAdminSessionResponse, isSuperAdminEmail } from '../../../../lib/admin';
import { createSessionToken, sessionCookie } from '../../../../lib/auth';
import {
  exchangeGoogleCode,
  fetchGoogleProfile,
  isGoogleAuthConfigured,
  parseGoogleOAuthState,
} from '../../../../lib/google-auth';
import { postAuthPath } from '../../../../lib/page-auth';
import { sendWelcomeEmail } from '../../../../lib/mail';
import { createTenantFromGoogle, getTenantByEmail } from '../../../../lib/store';

export const prerender = false;

function redirect(path: string, cookie?: string) {
  const headers: Record<string, string> = { Location: path };
  if (cookie) headers['Set-Cookie'] = cookie;
  return new Response(null, { status: 302, headers });
}

export const GET: APIRoute = async ({ request }) => {
  if (!isGoogleAuthConfigured()) {
    return redirect('/login?error=google_unavailable');
  }

  const url = new URL(request.url);
  const err = url.searchParams.get('error');
  if (err) {
    return redirect('/login?error=google_denied');
  }

  const code = url.searchParams.get('code') || '';
  const state = url.searchParams.get('state') || '';
  const mode = parseGoogleOAuthState(state);
  if (!code || !mode) {
    return redirect('/login?error=google_invalid');
  }

  try {
    const accessToken = await exchangeGoogleCode(code);
    const profile = await fetchGoogleProfile(accessToken);

    if (!profile.emailVerified) {
      return redirect('/login?error=google_unverified');
    }

    if (isSuperAdminEmail(profile.email)) {
      return createAdminSessionResponse('/admin');
    }

    let tenant = await getTenantByEmail(profile.email);

    if (!tenant) {
      if (mode === 'login') {
        return redirect('/login?error=google_no_account');
      }
      tenant = await createTenantFromGoogle({
        email: profile.email,
        ownerName: profile.name,
        googleSub: profile.sub,
      });
      sendWelcomeEmail(tenant).catch(() => {});
    }

    const token = createSessionToken(tenant.id);
    return redirect(postAuthPath(tenant), sessionCookie(token));
  } catch (e) {
    console.error('[auth/google/callback]', e instanceof Error ? e.message : e);
    return redirect('/login?error=google_failed');
  }
};
