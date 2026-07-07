import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const SCOPES = ['openid', 'email', 'profile'].join(' ');

export type GoogleAuthMode = 'login' | 'register';

export type GoogleProfile = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  givenName: string;
  picture?: string;
};

function siteUrl() {
  return (process.env.PUBLIC_SITE_URL || 'http://localhost:4321').replace(/\/$/, '');
}

export function googleRedirectUri() {
  return `${siteUrl()}/api/auth/google/callback`;
}

export function isGoogleAuthConfigured() {
  const id = process.env.GOOGLE_CLIENT_ID?.trim();
  const secret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  return Boolean(id && secret);
}

function oauthSecret() {
  const session = process.env.SESSION_SECRET?.trim();
  if (session && session.length >= 24 && !/change-me|citas-change-me|citas-dev/i.test(session)) {
    return session;
  }
  const google = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (google) return google;
  if (process.env.NODE_ENV !== 'production') return 'citas-dev-secret-local-only';
  throw new Error('oauth_secret_unavailable');
}

function sign(data: string) {
  return createHmac('sha256', oauthSecret()).update(data).digest('base64url');
}

function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function createGoogleOAuthState(mode: GoogleAuthMode) {
  const payload = JSON.stringify({
    n: randomBytes(12).toString('hex'),
    m: mode,
    e: Date.now() + 10 * 60_000,
  });
  const body = Buffer.from(payload, 'utf8').toString('base64url');
  return `${body}.${sign(body)}`;
}

export function parseGoogleOAuthState(state: string): GoogleAuthMode | null {
  if (!state || !state.includes('.')) return null;
  const [body, sig] = state.split('.');
  if (!body || !sig || !safeEqual(sign(body), sig)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      m?: GoogleAuthMode;
      e?: number;
    };
    if (!parsed.m || (parsed.m !== 'login' && parsed.m !== 'register')) return null;
    if (!parsed.e || Date.now() > parsed.e) return null;
    return parsed.m;
  } catch {
    return null;
  }
}

export function googleAuthUrl(mode: GoogleAuthMode) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) throw new Error('google_not_configured');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleRedirectUri(),
    response_type: 'code',
    scope: SCOPES,
    state: createGoogleOAuthState(mode),
    prompt: 'select_account',
    access_type: 'online',
  });

  return `${GOOGLE_AUTH_URL}?${params}`;
}

export async function exchangeGoogleCode(code: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error('google_not_configured');

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: googleRedirectUri(),
      grant_type: 'authorization_code',
    }),
  });

  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error || 'google_token_failed');
  }
  return data.access_token;
}

export async function fetchGoogleProfile(accessToken: string): Promise<GoogleProfile> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await res.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    given_name?: string;
    picture?: string;
    error?: string;
  };

  if (!res.ok || !data.sub || !data.email) {
    throw new Error(data.error || 'google_profile_failed');
  }

  return {
    sub: data.sub,
    email: data.email.trim().toLowerCase(),
    emailVerified: data.email_verified === true,
    name: (data.name || data.given_name || data.email.split('@')[0] || 'Usuario').trim(),
    givenName: (data.given_name || data.name || 'Usuario').trim(),
    picture: data.picture,
  };
}

export function googlePasswordHash(sub: string) {
  return `google$${sub}`;
}

export function isGooglePasswordHash(stored: string) {
  return String(stored || '').startsWith('google$');
}
