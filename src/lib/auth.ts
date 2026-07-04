import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const COOKIE = 'citas_session';

function secret() {
  return process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || 'citas-dev-secret';
}

function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [algo, salt, hash] = String(stored || '').split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const next = scryptSync(password, salt, 64).toString('hex');
  return safeEqual(next, hash);
}

export function createSessionToken(tenantId: string) {
  const exp = Date.now() + TOKEN_TTL_MS;
  const nonce = randomBytes(8).toString('hex');
  const payload = `citas1.${tenantId}.${exp}.${nonce}`;
  const sig = createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${Buffer.from(payload, 'utf8').toString('base64url')}.${sig}`;
}

export function readSessionToken(token: string): { tenantId: string } | null {
  if (!token || !token.includes('.')) return null;
  try {
    const [payloadB64, sig] = token.split('.');
    if (!payloadB64 || !sig) return null;
    const payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const expected = createHmac('sha256', secret()).update(payload).digest('base64url');
    if (!safeEqual(sig, expected)) return null;
    const parts = payload.split('.');
    if (parts[0] !== 'citas1') return null;
    const tenantId = parts[1];
    const exp = Number(parts[2]);
    if (!tenantId || !Number.isFinite(exp) || Date.now() > exp) return null;
    return { tenantId };
  } catch {
    return null;
  }
}

export function sessionCookieName() {
  return COOKIE;
}

export function sessionCookie(token: string, maxAgeSec = TOKEN_TTL_MS / 1000) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAgeSec)}${secure}`;
}

export function clearSessionCookie() {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function tokenFromRequest(request: Request) {
  const header = request.headers.get('authorization') || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return match?.[1] || '';
}

export function tenantIdFromRequest(request: Request) {
  const session = readSessionToken(tokenFromRequest(request));
  return session?.tenantId || null;
}

export function newId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`;
}

export function slugify(input: string) {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}
