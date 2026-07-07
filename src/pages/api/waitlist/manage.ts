import type { APIRoute } from 'astro';
import { requireModule } from '../../../lib/require-module';
import { bad, json } from '../../../lib/http';
import { getWaitlist, removeWaitlistEntry } from '../../../lib/store';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const guard = await requireModule(request, 'waitlist');
  if (guard.error) return guard.error;
  const list = await getWaitlist(guard.tenantId);
  return json({ ok: true, waitlist: list });
};

export const DELETE: APIRoute = async ({ request }) => {
  const guard = await requireModule(request, 'waitlist');
  if (guard.error) return guard.error;
  const url = new URL(request.url);
  const id = url.searchParams.get('id') || '';
  if (!id) return bad('id requerido');
  await removeWaitlistEntry(guard.tenantId, id);
  return json({ ok: true });
};
