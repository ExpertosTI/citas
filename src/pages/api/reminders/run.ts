import type { APIRoute } from 'astro';
import { bad, json } from '../../../lib/http';
import { processDueReminders } from '../../../lib/mail';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const secret = process.env.REMINDER_SECRET || process.env.SESSION_SECRET || '';
  const header = request.headers.get('x-reminder-secret') || '';
  if (secret && header !== secret) return bad('Unauthorized', 401);

  const result = await processDueReminders();
  return json({ ok: true, ...result });
};
