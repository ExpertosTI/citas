import type { APIRoute } from 'astro';
import { compareSecret, reminderSecret } from '../../../lib/security';
import { bad, json } from '../../../lib/http';
import { processDueReminders } from '../../../lib/mail';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const secret = reminderSecret();
  if (!secret) return bad('Unauthorized', 401);

  const header = request.headers.get('x-reminder-secret') || '';
  if (!compareSecret(header, secret)) return bad('Unauthorized', 401);

  const result = await processDueReminders();
  return json({ ok: true, ...result });
};
