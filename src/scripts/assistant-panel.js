/** @typedef {{ role: 'user' | 'assistant', content: string }} Msg */
/** @typedef {{ businessName?: string, bio?: string, services?: Array<{ name: string, price: number, durationMin: number }>, openHour?: number, closeHour?: number, lunchStartHour?: number, lunchEndHour?: number, closedWeekdays?: number[], removeServices?: string[] }} Setup */

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
  const greeting = root.dataset.greeting || '';
  const currency = root.dataset.currency || 'RD$';

  /** @type {Msg[]} */
  const messages = [];
  /** @type {Setup} */
  let draftSetup = {};
  let readyToApply = false;
  let busy = false;
  let opened = false;

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderMarkdownLite(text) {
    return esc(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
  }

  function open() {
    drawer?.classList.remove('hidden');
    backdrop?.classList.remove('hidden');
    document.body.classList.add('assistant-open');
    if (!opened) {
      messages.push({ role: 'assistant', content: greeting });
      renderMessages();
      opened = true;
    }
    input?.focus();
  }

  function close() {
    drawer?.classList.add('hidden');
    backdrop?.classList.add('hidden');
    document.body.classList.remove('assistant-open');
  }

  function showTyping() {
    if (!messagesEl) return;
    const el = document.createElement('div');
    el.id = 'assistant-typing';
    el.className = 'assistant-msg assistant-msg--ai';
    el.innerHTML = `
      <span class="assistant-msg__avatar">AI</span>
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
        ${m.role === 'assistant' ? '<span class="assistant-msg__avatar">AI</span>' : ''}
        <div class="assistant-msg__bubble">${renderMarkdownLite(m.content)}</div>
      </div>`,
      )
      .join('');
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
      <p class="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Cambios pendientes</p>
      ${draftSetup.openHour !== undefined ? `<p class="mt-1 text-xs text-ink-soft">Horario: ${draftSetup.openHour}:00 – ${draftSetup.closeHour}:00</p>` : ''}
      ${svcs ? `<ul class="mt-1 space-y-0.5 text-xs">${svcs}</ul>` : ''}
      ${removes ? `<ul class="mt-1">${removes}</ul>` : ''}`;
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
      const json = await post({ action: 'chat', messages });
      hideTyping();
      messages.push({ role: 'assistant', content: String(json.reply) });
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
      messages.push({ role: 'assistant', content: '**Cambios guardados.** Recarga la página si no los ves al instante.' });
      draftSetup = {};
      readyToApply = false;
      renderMessages();
      renderPreview();
      applyBtn.textContent = 'Aplicar cambios';
      setTimeout(() => location.reload(), 1200);
    } catch (err) {
      applyBtn.textContent = 'Aplicar cambios';
      alert(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      applyBtn.disabled = false;
    }
  });
}
