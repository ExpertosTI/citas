import { createHmac, timingSafeEqual } from 'node:crypto';
import { sessionSecret as getSessionSecret } from './security';

const COOKIE = 'citas_admin';
const TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

function secret() {
  return getSessionSecret();
}

function adminPassword() {
  return process.env.ADMIN_PASSWORD?.trim() || '';
}

function adminEmail() {
  return (process.env.ADMIN_EMAIL || 'info@renace.tech').trim().toLowerCase();
}

function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function verifyAdminCredentials(email: string, password: string) {
  const pass = adminPassword();
  if (!pass || pass.length < 8) return false;
  return email.trim().toLowerCase() === adminEmail() && safeEqual(password, pass);
}

export function createAdminToken() {
  const exp = Date.now() + TTL_MS;
  const payload = `citas-admin.${exp}`;
  const sig = createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${Buffer.from(payload, 'utf8').toString('base64url')}.${sig}`;
}

export function readAdminToken(token: string): boolean {
  if (!token || !token.includes('.')) return false;
  try {
    const [payloadB64, sig] = token.split('.');
    const payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const expected = createHmac('sha256', secret()).update(payload).digest('base64url');
    if (!safeEqual(sig, expected)) return false;
    const parts = payload.split('.');
    if (parts[0] !== 'citas-admin') return false;
    const exp = Number(parts[1]);
    return Number.isFinite(exp) && Date.now() <= exp;
  } catch {
    return false;
  }
}

export function adminCookieName() {
  return COOKIE;
}

export function adminCookie(token: string) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${TTL_MS / 1000}${secure}`;
}

export function clearAdminCookie() {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

export function isAdminRequest(request: Request) {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return match?.[1] ? readAdminToken(match[1]) : false;
}

export function adminEmailConfigured() {
  return adminEmail();
}
