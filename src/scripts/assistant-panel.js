/** @typedef {{ role: 'user' | 'assistant', content: string, cards?: AptCard[] }} Msg */
/** @typedef {{ id: string, clientName: string, serviceName: string, when: string, status: string, statusLabel: string, code: string, date: string, pending: boolean }} AptCard */
/** @typedef {{ businessName?: string, bio?: string, services?: Array<{ name: string, price: number, durationMin: number }>, openHour?: number, closeHour?: number, lunchStartHour?: number, lunchEndHour?: number, closedWeekdays?: number[], removeServices?: string[] }} Setup */

import { confirmAction, toast } from './ui-feedback.js';

const SCISSORS_SVG = `<svg class="asst-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><circle cx="6" cy="7" r="2.5"/><circle cx="6" cy="17" r="2.5"/><path d="M8.5 8.5L20 3M8.5 15.5L20 21M20 3L14 12L20 21"/></svg>`;

export function initAssistantPanel() {
  const root = document.getElementById('assistant-panel-root');
  if (!root) return;

  const fab = document.getElementById('assistant-fab');
  const backdrop = document.getElementById('assistant-backdrop');
  const drawer = document.getElementById('assistant-drawer');
  const closeBtn = document.getElementById('assistant-close');
  const messagesEl = document.getElementById('assistant-messages');
  const previewEl = document.getElementById('assistant-preview');
  const form = document.getElementById('assistant-form');
  const input = document.getElementById('assistant-input');
  const applyBtn = document.getElementById('assistant-apply');
  const greeting = JSON.parse(root.dataset.greeting || '""');
  const currency = root.dataset.currency || 'RD$';

  /** @type {Msg[]} */
  const messages = [];
  /** @type {Setup} */
  let draftSetup = {};
  let readyToApply = false;
  let busy = false;
  let opened = false;

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderMarkdownLite(text) {
    return esc(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/_(.+?)_/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  /** @param {AptCard} c */
  function renderAppointmentCard(c) {
    const badgeClass =
      c.status === 'pending'
        ? 'asst-apt-card__badge--pending'
        : c.status === 'confirmed'
          ? 'asst-apt-card__badge--confirmed'
          : '';
    return `
      <article class="asst-apt-card" data-id="${esc(c.id)}">
        <div class="asst-apt-card__head">
          <span class="asst-apt-card__glyph">${SCISSORS_SVG}</span>
          <div class="asst-apt-card__info">
            <p class="asst-apt-card__client">${esc(c.clientName)}</p>
            <p class="asst-apt-card__meta">${esc(c.serviceName)} · ${esc(c.when)}</p>
          </div>
          <span class="asst-apt-card__badge ${badgeClass}">${esc(c.statusLabel)}</span>
        </div>
        ${c.code ? `<p class="asst-apt-card__code">#${esc(c.code)}</p>` : ''}
        <div class="asst-apt-card__actions">
          ${
            c.pending
              ? `<button type="button" class="asst-btn asst-btn--confirm" data-apt-action="confirmed" data-apt-id="${esc(c.id)}">Confirmar</button>
                 <button type="button" class="asst-btn asst-btn--reject" data-apt-action="cancelled" data-apt-id="${esc(c.id)}">Rechazar</button>`
              : ''
          }
          <a href="/app?date=${esc(c.date)}" class="asst-btn asst-btn--ghost">Ver bahía</a>
        </div>
      </article>`;
  }

  /** @param {AptCard[]} cards */
  function renderCards(cards) {
    if (!cards?.length) return '';
    return `<div class="asst-cards">${cards.map(renderAppointmentCard).join('')}</div>`;
  }

  async function patchAppointment(id, body) {
    const res = await fetch(`/api/appointments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(String(json.error || 'No se pudo actualizar'));
    }
  }

  function bindCardActions() {
    messagesEl?.querySelectorAll('[data-apt-action]').forEach((btn) => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-apt-id');
        const action = btn.getAttribute('data-apt-action');
        if (!id || !action || busy) return;
        if (action === 'cancelled') {
          const ok = await confirmAction('¿Cancelar esta cita?', {
            confirmLabel: 'Sí, cancelar',
            cancelLabel: 'No',
          });
          if (!ok) return;
        }
        busy = true;
        btn.setAttribute('disabled', 'true');
        try {
          await patchAppointment(id, { status: action, notify: true });
          toast(action === 'confirmed' ? 'Cita confirmada' : 'Cita cancelada', 'success');
          setTimeout(() => location.reload(), 700);
        } catch (err) {
          toast(err instanceof Error ? err.message : 'Error', 'error');
          btn.removeAttribute('disabled');
          busy = false;
        }
      });
    });
  }

  function open() {
    drawer?.classList.add('is-open');
    backdrop?.classList.add('is-open');
    drawer?.setAttribute('aria-hidden', 'false');
    backdrop?.setAttribute('aria-hidden', 'false');
    document.body.classList.add('assistant-open');
    if (!opened) {
      messages.push({ role: 'assistant', content: greeting });
      renderMessages();
      opened = true;
    }
    input?.focus();
  }

  function close() {
    drawer?.classList.remove('is-open');
    backdrop?.classList.remove('is-open');
    drawer?.setAttribute('aria-hidden', 'true');
    backdrop?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('assistant-open');
    hideTyping();
  }

  function showTyping() {
    if (!messagesEl) return;
    const el = document.createElement('div');
    el.id = 'assistant-typing';
    el.className = 'assistant-msg assistant-msg--ai';
    el.innerHTML = `
      <span class="assistant-msg__avatar">${SCISSORS_SVG}</span>
      <div class="assistant-msg__bubble assistant-msg__typing">
        <span></span><span></span><span></span>
      </div>`;
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function hideTyping() {
    document.getElementById('assistant-typing')?.remove();
  }

  function renderMessages() {
    if (!messagesEl) return;
    messagesEl.innerHTML = messages
      .map(
        (m) => `
      <div class="assistant-msg assistant-msg--${m.role === 'assistant' ? 'ai' : 'user'}">
        ${m.role === 'assistant' ? `<span class="assistant-msg__avatar">${SCISSORS_SVG}</span>` : ''}
        <div class="assistant-msg__bubble">
          <div class="assistant-msg__text">${renderMarkdownLite(m.content)}</div>
          ${m.cards?.length ? renderCards(m.cards) : ''}
        </div>
      </div>`,
      )
      .join('');
    bindCardActions();
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function renderPreview() {
    if (!previewEl || !applyBtn) return;
    if (!readyToApply || !Object.keys(draftSetup).length) {
      previewEl.classList.add('hidden');
      applyBtn.classList.add('hidden');
      return;
    }

    const svcs = (draftSetup.services || [])
      .map((s) => `<li>${esc(s.name)} · ${currency}${s.price}</li>`)
      .join('');
    const removes = (draftSetup.removeServices || []).map((n) => `<li class="text-red-600">− ${esc(n)}</li>`).join('');

    previewEl.innerHTML = `
      <p class="asst-preview__label">Cambios pendientes</p>
      ${draftSetup.openHour !== undefined ? `<p class="asst-preview__line">Horario: ${draftSetup.openHour}:00 – ${draftSetup.closeHour}:00</p>` : ''}
      ${svcs ? `<ul class="asst-preview__list">${svcs}</ul>` : ''}
      ${removes ? `<ul class="asst-preview__list">${removes}</ul>` : ''}`;
    previewEl.classList.remove('hidden');
    applyBtn.classList.remove('hidden');
  }

  function mergeSetup(next) {
    if (!next) return;
    draftSetup = {
      ...draftSetup,
      ...next,
      services: next.services?.length ? next.services : draftSetup.services,
      closedWeekdays: next.closedWeekdays?.length ? next.closedWeekdays : draftSetup.closedWeekdays,
      removeServices: next.removeServices?.length
        ? [...(draftSetup.removeServices || []), ...next.removeServices]
        : draftSetup.removeServices,
    };
  }

  async function post(body) {
    const res = await fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ ...body, mode: 'assistant' }),
    });
    const raw = await res.text();
    let json;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new Error('Respuesta inválida del servidor.');
    }
    if (!res.ok) throw new Error(String(json.error || 'Error'));
    return json;
  }

  async function sendUserMessage(text) {
    if (busy || !input) return;
    busy = true;
    input.disabled = true;

    messages.push({ role: 'user', content: text });
    renderMessages();
    showTyping();

    try {
      const json = await post({ action: 'chat', messages: messages.map(({ role, content }) => ({ role, content })) });
      hideTyping();
      messages.push({
        role: 'assistant',
        content: String(json.reply),
        cards: Array.isArray(json.cards) ? json.cards : [],
      });
      mergeSetup(json.setup);
      readyToApply = Boolean(json.readyToApply);
      renderMessages();
      renderPreview();
    } catch (err) {
      hideTyping();
      messages.push({
        role: 'assistant',
        content: `Ups: ${err instanceof Error ? err.message : 'Error'}. Intenta de nuevo.`,
      });
      renderMessages();
    } finally {
      busy = false;
      input.disabled = false;
      input.focus();
    }
  }

  fab?.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  backdrop?.addEventListener('click', close);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer?.classList.contains('is-open')) close();
  });

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input?.value.trim();
    if (!text) return;
    input.value = '';
    sendUserMessage(text);
  });

  applyBtn?.addEventListener('click', async () => {
    if (!(applyBtn instanceof HTMLButtonElement)) return;
    applyBtn.textContent = 'Guardando…';
    applyBtn.disabled = true;
    try {
      await post({ action: 'apply', setup: draftSetup });
      messages.push({ role: 'assistant', content: 'Cambios guardados. Recarga la página si no los ves al instante.' });
      draftSetup = {};
      readyToApply = false;
      renderMessages();
      renderPreview();
      applyBtn.textContent = 'Aplicar cambios';
      setTimeout(() => location.reload(), 1200);
    } catch (err) {
      applyBtn.textContent = 'Aplicar cambios';
      toast(err instanceof Error ? err.message : 'No se pudo guardar', 'error');
    } finally {
      applyBtn.disabled = false;
    }
  });
}
