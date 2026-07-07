export { phoneForInput, normalizePhoneDigits, formatPhoneDisplay, whatsAppUrl, telUrl, digitsOnly as phoneDigits } from '../lib/phone.ts';

/** @param {Record<string, string | undefined>} params */
export function bookAppUrl(params) {
  const q = new URLSearchParams();
  if (params.date) q.set('date', params.date);
  if (params.clientName) q.set('clientName', params.clientName);
  if (params.clientPhone) q.set('clientPhone', params.clientPhone);
  if (params.clientEmail) q.set('clientEmail', params.clientEmail);
  if (params.serviceId) q.set('serviceId', params.serviceId);
  q.set('newApt', '1');
  return `/app?${q.toString()}`;
}
