import { normalizePhoneDigits } from './phone';

function env(name: string, fallback = '') {
  const raw = process.env[name] ?? fallback;
  return String(raw).trim().replace(/^["']|["']$/g, '');
}

export function whatsappConfigured() {
  return Boolean(
    env('EVOLUTION_API_URL') && env('EVOLUTION_API_KEY') && env('EVOLUTION_INSTANCE'),
  );
}

export function getWhatsAppConfigStatus() {
  if (!whatsappConfigured()) {
    return { configured: false as const, reason: 'EVOLUTION_* vacío' };
  }
  return { configured: true as const };
}

async function sendText(to: string, text: string) {
  const baseUrl = env('EVOLUTION_API_URL').replace(/\/$/, '');
  const apiKey = env('EVOLUTION_API_KEY');
  const instance = env('EVOLUTION_INSTANCE');
  const phone = normalizePhoneDigits(to);
  if (!phone) return { ok: false as const, error: 'invalid_phone' };

  const res = await fetch(`${baseUrl}/message/sendText/${encodeURIComponent(instance)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
    },
    body: JSON.stringify({ number: phone, text }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.warn('[whatsapp] send failed', res.status, detail.slice(0, 200));
    return { ok: false as const, error: `http_${res.status}` };
  }
  return { ok: true as const };
}

export async function sendWhatsAppMessage(
  to: string,
  text: string,
  countryCode = 'DO',
) {
  if (!whatsappConfigured()) return { ok: false as const, error: 'not_configured' };
  const phone = normalizePhoneDigits(to, countryCode);
  if (!phone) return { ok: false as const, error: 'invalid_phone' };
  return sendText(phone, text);
}
