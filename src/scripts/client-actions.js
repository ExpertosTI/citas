/** @param {string} phone */
export function phoneDigits(phone) {
  return String(phone || '').replace(/\D/g, '');
}

/** @param {string} phone @param {string} [text] */
export function whatsAppUrl(phone, text = '') {
  const digits = phoneDigits(phone);
  if (!digits) return '';
  const q = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${digits}${q}`;
}

/** @param {string} phone */
export function telUrl(phone) {
  const digits = phoneDigits(phone);
  return digits ? `tel:+${digits}` : '';
}

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
