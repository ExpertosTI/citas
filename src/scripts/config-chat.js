/**
 * Shared Gemini-style config chat for onboarding + assistant drawer.
 */

/** @typedef {{ role: 'user' | 'assistant', content: string, imageUrl?: string, cards?: import('./assistant-panel.js').AptCard[] }} ChatMsg */
/** @typedef {import('../lib/onboarding-ai').OnboardingSetupDraft} Setup */

import { toast } from './ui-feedback.js';
import { formatHour } from '../lib/schedule-parser';

const SCISSORS_SVG = `<svg class="asst-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><circle cx="6" cy="7" r="2.5"/><circle cx="6" cy="17" r="2.5"/><path d="M8.5 8.5L20 3M8.5 15.5L20 21M20 3L14 12L20 21"/></svg>`;

const CHAT_STORAGE_TTL_MS = 8 * 60 * 60 * 1000;

function chatStorageKey(mode) {
  return `citas-chat-${mode}`;
}

export function clearConfigChatState(mode) {
  try {
    sessionStorage.removeItem(chatStorageKey(mode));
  } catch {
    /* ok */
  }
}

function loadConfigChatState(mode) {
  if (mode !== 'assistant') return null;
  try {
    const raw = sessionStorage.getItem(chatStorageKey(mode));
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.messages?.length || Date.now() - (data.ts || 0) > CHAT_STORAGE_TTL_MS) {
      clearConfigChatState(mode);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function saveConfigChatState(mode, payload) {
  if (mode !== 'assistant') return;
  try {
    sessionStorage.setItem(
      chatStorageKey(mode),
      JSON.stringify({ ...payload, ts: Date.now() }),
    );
  } catch {
    /* quota */
  }
}

export function mergeSetupDraft(prev, next) {
  if (!next) return prev || {};
  const mergedServices = next.services?.length
    ? [...(prev?.services || []), ...next.services].reduce((acc, s) => {
        const key = s.name.toLowerCase();
        if (!acc.some((x) => x.name.toLowerCase() === key)) acc.push(s);
        return acc;
      }, /** @type {NonNullable<Setup['services']>} */ ([]))
    : prev?.services;
  return {
    ...prev,
    ...next,
    services: mergedServices,
    closedWeekdays: next.closedWeekdays?.length ? next.closedWeekdays : prev?.closedWeekdays,
    removeServices: next.removeServices?.length
      ? [...(prev?.removeServices || []), ...next.removeServices]
      : prev?.removeServices,
  };
}

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

function weekdayLabel(d) {
  return ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][d] || String(d);
}

/**
 * @param {object} opts
 */
export function createConfigChat(opts) {
  const {
    mode,
    root,
    messagesEl,
    previewEl,
    formEl,
    inputEl,
    applyBtn,
    chipsEl,
    phasesEl,
    fileInput,
    attachBtn,
    geminiBadge,
    currency = 'RD$',
    businessName = '',
    greeting = '',
    onApply,
    onSkip,
    onSuccess,
    renderCards,
    variant = 'onboarding',
    avatarHtml = '<span class="onboarding-chat__avatar">AI</span>',
    bubbleClass = 'onboarding-chat__bubble',
    msgClassPrefix = 'onboarding-chat__bubble--',
    onMessagesRendered,
  } = opts;

  /** @type {ChatMsg[]} */
  const messages = [];
  /** @type {Setup} */
  let draftSetup = {};
  let readyToApply = false;
  let busy = false;
  let currentPhase = 'brand';
  let logoUrl = root?.dataset.logoUrl || '';
  let serviceCount = Number(root?.dataset.serviceCount || 0);
  /** @type {string[]} */
  let lastSuggestions = [];

  const isMobile = () => window.matchMedia('(max-width: 640px)').matches;

  function setBusyState(isBusy) {
    busy = isBusy;
    if (inputEl) inputEl.disabled = isBusy;
    if (isBusy) attachBtn?.setAttribute('disabled', 'true');
    else attachBtn?.removeAttribute('disabled');
    applyBtn?.toggleAttribute('disabled', isBusy);
    formEl?.querySelector('button[type="submit"]')?.toggleAttribute('disabled', isBusy);
    chipsEl?.querySelectorAll('.chat-chip').forEach((btn) => {
      btn.toggleAttribute('disabled', isBusy);
      btn.classList.toggle('is-busy', isBusy);
    });
  }

  function scrollMessagesToEnd() {
    if (!messagesEl) return;
    messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });
  }

  function isPhotoChip(text) {
    return /📎|fotos?\s+de\s+servicio/i.test(text);
  }

  const saved = loadConfigChatState(mode);
  if (saved?.messages?.length) {
    messages.push(...saved.messages);
    draftSetup = saved.draftSetup || {};
    readyToApply = Boolean(saved.readyToApply);
    if (saved.currentPhase) currentPhase = saved.currentPhase;
    if (saved.suggestions?.length) lastSuggestions = saved.suggestions;
  }

  function persistState() {
    saveConfigChatState(mode, {
      messages: messages.map(({ role, content, imageUrl, cards }) => ({
        role,
        content,
        imageUrl,
        cards: cards?.length ? cards : undefined,
      })),
      draftSetup,
      readyToApply,
      currentPhase,
      suggestions: lastSuggestions,
    });
  }

  function updatePhases(phase) {
    currentPhase = phase || currentPhase;
    if (!phasesEl) return;
    const steps = phasesEl.querySelectorAll('[data-phase]');
    const idx = Array.from(steps).findIndex((el) => el.getAttribute('data-phase') === currentPhase);
    steps.forEach((el, i) => {
      el.classList.toggle('is-active', i === idx);
      el.classList.toggle('is-done', i < idx);
    });
    const label = phasesEl.querySelector('[data-phase-label]');
    if (label) label.textContent = steps[idx]?.getAttribute('data-phase-label') || '';
  }

  function renderChips(suggestions) {
    if (!chipsEl) return;
    if (suggestions?.length) lastSuggestions = [...suggestions];
    let list = lastSuggestions.length ? [...lastSuggestions] : [];
    if (readyToApply) {
      list = list.filter((s) => !/aplicar|abrir bah[ií]a/i.test(s));
    }
    if (!list.length) {
      chipsEl.innerHTML = '';
      chipsEl.classList.add('hidden');
      return;
    }
    chipsEl.classList.remove('hidden');
    chipsEl.innerHTML = list
      .map(
        (s) =>
          `<button type="button" class="chat-chip" data-chip="${esc(s)}" aria-label="Enviar: ${esc(s)}">${esc(s)}</button>`,
      )
      .join('');
    chipsEl.querySelectorAll('[data-chip]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (busy) {
          toast('Espera un momento…', 'info');
          return;
        }
        const text = btn.getAttribute('data-chip');
        if (!text) return;
        if (isPhotoChip(text)) {
          fileInput?.click();
          return;
        }
        btn.classList.add('is-selected');
        sendUserMessage(text).finally(() => btn.classList.remove('is-selected'));
      });
    });
    if (busy) {
      chipsEl.querySelectorAll('.chat-chip').forEach((btn) => {
        btn.setAttribute('disabled', 'true');
        btn.classList.add('is-busy');
      });
    }
  }

  function showTyping() {
    const el = document.createElement('div');
    el.id = 'config-chat-typing';
    el.className = `${bubbleClass} ${msgClassPrefix}assistant`;
    el.innerHTML = `
      ${avatarHtml}
      <div class="onboarding-chat__text onboarding-chat__typing">
        <span></span><span></span><span></span>
      </div>`;
    messagesEl?.appendChild(el);
    scrollMessagesToEnd();
  }

  function hideTyping() {
    document.getElementById('config-chat-typing')?.remove();
  }

  function renderMessages() {
    if (!messagesEl) return;
    messagesEl.innerHTML = messages
      .map((m) => {
        const img = m.imageUrl
          ? `<img class="chat-msg__image" src="${esc(m.imageUrl)}" alt="Logo" />`
          : '';
        const cards = m.cards?.length && renderCards ? renderCards(m.cards) : '';
        const body = `${img}<div>${renderMarkdownLite(m.content)}</div>${cards}`;

        if (variant === 'drawer') {
          const side = m.role === 'assistant' ? 'ai' : 'user';
          return `
          <div class="assistant-msg assistant-msg--${side}">
            ${m.role === 'assistant' ? avatarHtml : ''}
            <div class="assistant-msg__bubble">
              <div class="assistant-msg__text">${body}</div>
            </div>
          </div>`;
        }

        return `
        <div class="${bubbleClass} ${msgClassPrefix}${m.role === 'assistant' ? 'assistant' : 'user'}">
          ${m.role === 'assistant' ? avatarHtml : ''}
          <div class="onboarding-chat__text">${body}</div>
        </div>`;
      })
      .join('');
    scrollMessagesToEnd();
    onMessagesRendered?.();
  }

  function renderPreview() {
    if (!previewEl || !applyBtn) return;
    const hasDraft = Object.keys(draftSetup).length > 0;
    if (!readyToApply || !hasDraft) {
      previewEl.classList.add('hidden');
      applyBtn.classList.add('hidden');
      return;
    }

    const svcs = (draftSetup.services || [])
      .map((s) => `<li>${esc(s.name)} · ${currency}${s.price} · ${s.durationMin} min</li>`)
      .join('');
    const removes = (draftSetup.removeServices || [])
      .map((n) => `<li class="text-danger">− ${esc(n)}</li>`)
      .join('');

    previewEl.innerHTML = `
      <div class="setup-preview-card">
        <div class="setup-preview-card__head">
          ${logoUrl ? `<img class="setup-preview-card__logo" src="${esc(logoUrl)}" alt="" />` : '<span class="setup-preview-card__logo setup-preview-card__logo--empty">Logo</span>'}
          <div>
            <p class="setup-preview-card__title">${esc(draftSetup.businessName || businessName)}</p>
            ${draftSetup.bio ? `<p class="setup-preview-card__bio">${esc(draftSetup.bio)}</p>` : ''}
          </div>
        </div>
        ${draftSetup.openHour !== undefined ? `<p class="setup-preview-card__line">🕐 ${formatHour(draftSetup.openHour)} – ${formatHour(draftSetup.closeHour)}</p>` : ''}
        ${draftSetup.closedWeekdays?.length ? `<p class="setup-preview-card__line">Cierra: ${draftSetup.closedWeekdays.map(weekdayLabel).join(', ')}</p>` : ''}
        ${draftSetup.whatsapp ? `<p class="setup-preview-card__line">WhatsApp: ${esc(draftSetup.whatsapp)}</p>` : ''}
        ${draftSetup.instagram ? `<p class="setup-preview-card__line">IG: @${esc(draftSetup.instagram.replace(/^@/, ''))}</p>` : ''}
        ${draftSetup.accentColor ? `<p class="setup-preview-card__line"><span class="setup-preview-card__swatch" style="background:${esc(draftSetup.accentColor)}"></span> Acento ${esc(draftSetup.accentColor)}</p>` : ''}
        ${svcs ? `<ul class="setup-preview-card__list">${svcs}</ul>` : ''}
        ${removes ? `<ul class="setup-preview-card__list">${removes}</ul>` : ''}
      </div>`;
    previewEl.classList.remove('hidden');
    applyBtn.classList.remove('hidden');
  }

  async function post(body) {
    const res = await fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ ...body, mode }),
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

  async function hydrate() {
    try {
      const res = await fetch(`/api/onboarding?mode=${mode}`, { credentials: 'same-origin' });
      const json = await res.json();
      if (!json.ok) return;
      logoUrl = json.logoUrl || logoUrl;
      serviceCount = json.serviceCount ?? serviceCount;
      if (json.phase) updatePhases(json.phase);
      if (json.suggestions) renderChips(json.suggestions);
      if (geminiBadge) {
        geminiBadge.classList.toggle('hidden', Boolean(json.geminiConfigured));
        geminiBadge.textContent = json.geminiConfigured ? '' : 'Asistente local';
      }
      if (json.tenant?.logoUrl) logoUrl = json.tenant.logoUrl.startsWith('/') ? json.tenant.logoUrl : logoUrl;
    } catch {
      /* ok */
    }
  }

  function applyResponse(json) {
    if (json.setup) draftSetup = mergeSetupDraft(draftSetup, json.setup);
    readyToApply = Boolean(json.readyToApply);
    if (json.phase) updatePhases(json.phase);
    if (json.suggestions) renderChips(json.suggestions);
    else if (lastSuggestions.length) renderChips(lastSuggestions);
    if (json.tenant?.logoUrl) logoUrl = json.tenant.logoUrl;
    renderPreview();
    persistState();
  }

  async function sendUserMessage(text, extra = {}) {
    if (busy || !inputEl) return;
    setBusyState(true);

    messages.push({ role: 'user', content: text });
    renderMessages();
    showTyping();

    try {
      const json = await post({
        action: 'chat',
        messages: messages.map(({ role, content }) => ({ role, content })),
        setup: draftSetup,
        ...extra,
      });
      hideTyping();
      if (json.fallback && geminiBadge) {
        geminiBadge.classList.remove('hidden');
        const authDown = /401|403/.test(String(json.geminiError || ''));
        geminiBadge.textContent = authDown ? 'Modo local' : 'Asistente local';
        if (json.geminiError && !authDown) {
          toast('Gemini no respondió — sigo en modo local', 'error');
        }
      } else if (geminiBadge) {
        geminiBadge.classList.add('hidden');
      }
      messages.push({
        role: 'assistant',
        content: String(json.reply),
        cards: Array.isArray(json.cards) ? json.cards : [],
      });
      applyResponse(json);
      renderMessages();
      persistState();
    } catch (err) {
      hideTyping();
      messages.push({
        role: 'assistant',
        content: `Ups: ${err instanceof Error ? err.message : 'Error'}. Intenta de nuevo.`,
      });
      renderMessages();
      persistState();
    } finally {
      setBusyState(false);
      if (!isMobile()) inputEl.focus();
    }
  }

  async function uploadLogo(file) {
    if (!file || busy) return;
    if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) {
      toast('Usa PNG, JPG o WEBP (máx 2MB)', 'error');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast('Imagen muy grande (máx 2MB)', 'error');
      return;
    }

    busy = true;
    setBusyState(true);

    const preview = URL.createObjectURL(file);
    const hint = inputEl?.value.trim() || '';
    const serviceHint = /servicio|producto|foto|corte|barba|tinte|cejas|color|manicure|imagen/i.test(hint);
    const wantsLogo = /logo|marca/i.test(hint) || (mode === 'onboarding' && !serviceHint);
    const isServicePhoto = !wantsLogo;

    if (isServicePhoto) {
      messages.push({
        role: 'user',
        content: hint || 'Subí una foto de servicio',
        imageUrl: preview,
      });
      renderMessages();
      showTyping();

      try {
        const fd = new FormData();
        fd.append('image', file);
        if (hint) fd.append('hint', hint);
        const up = await fetch('/api/services/image', { method: 'POST', body: fd, credentials: 'same-origin' });
        const upJson = await up.json();
        if (!up.ok) throw new Error(String(upJson.error || 'No se pudo subir'));

        const json = await post({
          action: 'chat',
          messages: messages.map(({ role, content }) => ({ role, content })),
          setup: draftSetup,
          servicePhoto: { serviceId: upJson.service?.id, hint },
        });
        hideTyping();
        URL.revokeObjectURL(preview);
        if (upJson.imageUrl) messages[messages.length - 1].imageUrl = upJson.imageUrl;
        messages.push({
          role: 'assistant',
          content: String(json.reply || `¡Foto guardada para **${upJson.serviceName}**!`),
          cards: Array.isArray(json.cards) ? json.cards : [],
        });
        applyResponse(json);
        renderMessages();
        persistState();
        if (inputEl) inputEl.value = '';
        toast('Foto de servicio guardada', 'success');
      } catch (err) {
        hideTyping();
        messages.push({
          role: 'assistant',
          content: `No pude guardar la foto: ${err instanceof Error ? err.message : 'error'}. Indica el servicio — ej. "foto del Corte".`,
        });
        renderMessages();
      } finally {
        setBusyState(false);
      }
      return;
    }

    messages.push({ role: 'user', content: 'Subí el logo de mi negocio', imageUrl: preview });
    renderMessages();
    showTyping();

    try {
      const fd = new FormData();
      fd.append('logo', file);
      const up = await fetch('/api/logo', { method: 'POST', body: fd, credentials: 'same-origin' });
      const upJson = await up.json();
      if (!up.ok) throw new Error(String(upJson.error || 'No se pudo subir'));

      logoUrl = upJson.logoUrl || logoUrl;
      const json = await post({
        action: 'chat',
        messages: messages.map(({ role, content }) => ({ role, content })),
        setup: draftSetup,
        logoJustUploaded: true,
      });
      hideTyping();
      URL.revokeObjectURL(preview);
      messages[messages.length - 1].imageUrl = logoUrl;
      messages.push({
        role: 'assistant',
        content: String(json.reply),
        cards: Array.isArray(json.cards) ? json.cards : [],
      });
      applyResponse(json);
      renderMessages();
      persistState();
      toast('Logo guardado', 'success');
    } catch (err) {
      hideTyping();
      messages.push({
        role: 'assistant',
        content: `No pude guardar el logo: ${err instanceof Error ? err.message : 'error'}`,
      });
      renderMessages();
    } finally {
      setBusyState(false);
    }
  }

  formEl?.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = inputEl?.value.trim();
    if (!text) return;
    inputEl.value = '';
    sendUserMessage(text);
  });

  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (file) uploadLogo(file);
  });

  attachBtn?.addEventListener('click', () => fileInput?.click());

  applyBtn?.addEventListener('click', async () => {
    if (!(applyBtn instanceof HTMLButtonElement) || busy) return;
    const defaultLabel = mode === 'onboarding' ? 'Aplicar y abrir bahía' : 'Aplicar cambios';
    applyBtn.textContent = mode === 'onboarding' ? 'Aplicando…' : 'Guardando…';
    applyBtn.classList.add('is-loading');
    applyBtn.disabled = true;
    try {
      await post({ action: 'apply', setup: draftSetup });
      applyBtn.textContent = '¡Listo!';
      if (onApply) await onApply();
      else if (onSuccess) onSuccess();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo guardar', 'error');
      applyBtn.textContent = defaultLabel;
    } finally {
      applyBtn.classList.remove('is-loading');
      applyBtn.disabled = false;
    }
  });

  if (onSkip) {
    const skipBtn = document.getElementById('skip-btn');
    skipBtn?.addEventListener('click', async () => {
      skipBtn.setAttribute('disabled', 'true');
      await post({ action: 'skip' });
      onSkip();
    });
  }

  if (greeting && !saved?.messages?.length) {
    messages.push({ role: 'assistant', content: greeting });
    renderMessages();
  } else if (saved?.messages?.length) {
    updatePhases(currentPhase);
    renderMessages();
    renderPreview();
    renderChips(saved.suggestions);
  }

  hydrate();

  return { sendUserMessage, uploadLogo, messages, getDraft: () => draftSetup };
}

export { SCISSORS_SVG, esc, renderMarkdownLite };
