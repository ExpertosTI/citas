import type { APIRoute } from 'astro';
import { collectEnvStatus } from '../../../lib/env-status';
import { isGeminiConfigured, probeGeminiStatus } from '../../../lib/gemini';
import { isGoogleAuthConfigured } from '../../../lib/google-auth';
import { bad, json } from '../../../lib/http';
import { compareSecret, reminderSecret } from '../../../lib/security';

export const prerender = false;

/** Diagnóstico de variables (sin valores secretos). Header: x-reminder-secret */
export const GET: APIRoute = async ({ request }) => {
  const secret = reminderSecret();
  if (!secret) return bad('Unauthorized', 401);

  const header = request.headers.get('x-reminder-secret') || '';
  if (!compareSecret(header, secret)) return bad('Unauthorized', 401);

  const status = collectEnvStatus();
  let geminiLive = false;
  let geminiError: string | undefined;
  const geminiKey = (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '').trim();
  const geminiKeyType = geminiKey.startsWith('AQ.')
    ? 'auth'
    : geminiKey.startsWith('AIza')
      ? 'standard'
      : geminiKey
        ? 'custom'
        : 'missing';
  if (isGeminiConfigured()) {
    const probe = await probeGeminiStatus();
    geminiLive = probe.live;
    geminiError = probe.error;
  }

  return json({
    ok: status.ok,
    commit: process.env.CITAS_COMMIT || null,
    runtime: {
      gemini: isGeminiConfigured(),
      geminiLive,
      geminiError,
      geminiKeyType,
      geminiModel: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
      google: isGoogleAuthConfigured(),
    },
    checks: status.checks,
    mail: {
      fromName: status.mailFrom,
      replyTo: status.replyTo,
      adminEmail: status.adminEmail,
    },
  });
};
