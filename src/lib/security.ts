import { timingSafeEqual } from 'node:crypto';

const buckets = new Map<string, { count: number; resetAt: number }>();

export function clientIp(request: Request) {
  const fwd = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return fwd || request.headers.get('x-real-ip')?.trim() || 'unknown';
}

/** In-memory sliding-window rate limit. Returns error message if blocked. */
export function rateLimit(key: string, max: number, windowMs: number): string | null {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now > entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  entry.count += 1;
  if (entry.count > max) return 'Demasiados intentos. Espera un momento e intenta de nuevo.';
  return null;
}

export function rateLimitRequest(request: Request, scope: string, max: number, windowMs: number) {
  return rateLimit(`${scope}:${clientIp(request)}`, max, windowMs);
}

export function compareSecret(provided: string, expected: string) {
  if (!expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function sessionSecret() {
  const s = process.env.SESSION_SECRET?.trim();
  if (process.env.NODE_ENV === 'production') {
    if (!s || s.length < 24 || /change-me|citas-change-me|citas-dev/i.test(s)) {
      throw new Error('SESSION_SECRET invalid or missing in production');
    }
    return s;
  }
  return s || 'citas-dev-secret-local-only';
}

/** Null when sessions can be issued; otherwise a short ops-facing reason. */
export function sessionSecretIssue(): string | null {
  try {
    sessionSecret();
    return null;
  } catch {
    return 'SESSION_SECRET invalid or missing in production';
  }
}

export function reminderSecret() {
  const s = process.env.REMINDER_SECRET?.trim() || process.env.SESSION_SECRET?.trim();
  if (!s || s.length < 16) return null;
  return s;
}

const TENANT_ID_RE = /^ten_[a-z0-9_]+$/;

export function isValidTenantId(id: string) {
  return TENANT_ID_RE.test(id);
}

export function escapeHtml(text: string) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizeEmailSubject(text: string) {
  return String(text || '')
    .replace(/[\r\n\t\0]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

export function securityHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy':
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  };
}

/** Basic magic-byte check for raster uploads */
export function sniffImageMime(buf: Buffer): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf.slice(8, 12).toString() === 'WEBP') {
    return 'image/webp';
  }
  return null;
}
