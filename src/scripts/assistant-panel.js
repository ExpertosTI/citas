/** @typedef {{ id: string, clientName: string, serviceName: string, when: string, status: string, statusLabel: string, code: string, date: string, pending: boolean }} AptCard */

import { confirmAction, toast } from './ui-feedback.js';
import { createConfigChat, SCISSORS_SVG, esc, clearConfigChatState } from './config-chat.js';

export function initAssistantPanel() {
  const root = document.getElementById('assistant-panel-root');
  if (!root) return;

  const fab = document.getElementById('assistant-fab');
  const backdrop = document.getElementById('assistant-backdrop');
  const drawer = document.getElementById('assistant-drawer');
  const closeBtn = document.getElementById('assistant-close');
  const greeting = JSON.parse(root.dataset.greeting || '""');

  let opened = false;
  /** @type {ReturnType<typeof createConfigChat> | null} */
  let chat = null;

  /** @param {AptCard} c */
  function renderAppointmentCard(c) {
    const badgeClass =
      c.status === 'pending'
        ? 'asst-apt-card__badge--pending'
        : c.status === 'confirmed'
          ? 'asst-apt-card__badge--confirmed'
          : c.status === 'cancelled'
            ? 'asst-apt-card__badge--cancelled'
            : '';
    return `
      <article class="asst-apt-card${c.pending ? '' : ' asst-apt-card--done'}" data-id="${esc(c.id)}">
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

  /** @param {HTMLElement} cardEl @param {'confirmed' | 'cancelled'} action */
  function markCardDone(cardEl, action) {
    cardEl.classList.add('asst-apt-card--done');
    const badge = cardEl.querySelector('.asst-apt-card__badge');
    if (badge) {
      badge.textContent = action === 'confirmed' ? 'Confirmada' : 'Cancelada';
      badge.className = `asst-apt-card__badge ${
        action === 'confirmed' ? 'asst-apt-card__badge--confirmed' : 'asst-apt-card__badge--cancelled'
      }`;
    }
    cardEl.querySelectorAll('[data-apt-action]').forEach((b) => b.remove());
  }

  function bindCardActions() {
    document.getElementById('assistant-messages')?.querySelectorAll('[data-apt-action]').forEach((btn) => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-apt-id');
        const action = btn.getAttribute('data-apt-action');
        if (!id || !action) return;
        if (action === 'cancelled') {
          const ok = await confirmAction('¿Cancelar esta cita?', {
            confirmLabel: 'Sí, cancelar',
            cancelLabel: 'No',
          });
          if (!ok) return;
        }
        const cardEl = btn.closest('.asst-apt-card');
        btn.setAttribute('disabled', 'true');
        cardEl?.querySelectorAll('[data-apt-action]').forEach((b) => b.setAttribute('disabled', 'true'));
        try {
          await patchAppointment(id, { status: action, notify: true });
          if (cardEl instanceof HTMLElement) markCardDone(cardEl, /** @type {'confirmed' | 'cancelled'} */ (action));
          toast(action === 'confirmed' ? 'Cita confirmada' : 'Cita cancelada', 'success');
        } catch (err) {
          toast(err instanceof Error ? err.message : 'Error', 'error');
          btn.removeAttribute('disabled');
          cardEl?.querySelectorAll('[data-apt-action]').forEach((b) => b.removeAttribute('disabled'));
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
      chat = createConfigChat({
        mode: 'assistant',
        root,
        messagesEl: document.getElementById('assistant-messages'),
        previewEl: document.getElementById('assistant-preview'),
        formEl: document.getElementById('assistant-form'),
        inputEl: document.getElementById('assistant-input'),
        applyBtn: document.getElementById('assistant-apply'),
        chipsEl: document.getElementById('assistant-chips'),
        phasesEl: document.getElementById('assistant-phases'),
        fileInput: document.getElementById('assistant-logo-file'),
        attachBtn: document.getElementById('assistant-logo-attach'),
        geminiBadge: document.getElementById('assistant-gemini-badge'),
        currency: root.dataset.currency || 'RD$',
        businessName: root.dataset.business || '',
        greeting,
        variant: 'drawer',
        avatarHtml: `<span class="assistant-msg__avatar">${SCISSORS_SVG}</span>`,
        renderCards,
        onMessagesRendered: bindCardActions,
        onSuccess: () => {
          clearConfigChatState('assistant');
          toast('Cambios guardados', 'success');
          setTimeout(() => location.reload(), 900);
        },
      });
      opened = true;
    }

    if (!window.matchMedia('(max-width: 640px)').matches) {
      document.getElementById('assistant-input')?.focus();
    }
  }

  function close() {
    drawer?.classList.remove('is-open');
    backdrop?.classList.remove('is-open');
    drawer?.setAttribute('aria-hidden', 'true');
    backdrop?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('assistant-open');
    document.getElementById('config-chat-typing')?.remove();
  }

  fab?.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  backdrop?.addEventListener('click', close);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer?.classList.contains('is-open')) close();
  });
}
