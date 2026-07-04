/** @typedef {'info' | 'success' | 'error'} ToastKind */

let toastTimer = 0;
/** @type {((value: unknown) => void) | null} */
let dialogResolve = null;
/** @type {'confirm' | 'prompt'} */
let dialogMode = 'confirm';

function ensureToast() {
  let el = document.getElementById('app-toast');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'app-toast';
  el.className = 'app-toast';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  document.body.appendChild(el);
  return el;
}

function ensureConfirm() {
  let el = document.getElementById('app-confirm');
  if (el) return el;
  el = document.createElement('dialog');
  el.id = 'app-confirm';
  el.className = 'app-confirm';
  el.innerHTML = `
    <form method="dialog" class="app-confirm__box">
      <p id="app-confirm-msg" class="app-confirm__msg"></p>
      <div class="app-confirm__actions">
        <button type="submit" value="no" class="btn-ghost btn-sm" data-confirm-cancel>Cancelar</button>
        <button type="submit" value="yes" class="btn-primary btn-sm" data-confirm-ok>Confirmar</button>
      </div>
    </form>`;
  document.body.appendChild(el);

  el.addEventListener('close', () => {
    const ok = el.returnValue === 'yes';
    if (dialogMode === 'prompt') {
      const input = document.getElementById('app-prompt-input');
      const value =
        ok && input instanceof HTMLInputElement ? input.value.trim() || null : null;
      dialogResolve?.(value);
    } else {
      dialogResolve?.(ok);
    }
    dialogMode = 'confirm';
    dialogResolve = null;
    const msg = el.querySelector('#app-confirm-msg');
    if (msg) msg.textContent = '';
  });
  el.addEventListener('cancel', (e) => {
    e.preventDefault();
    dialogResolve?.(dialogMode === 'prompt' ? null : false);
    dialogMode = 'confirm';
    dialogResolve = null;
    const msg = el.querySelector('#app-confirm-msg');
    if (msg) msg.textContent = '';
    el.close('no');
  });
  return el;
}

/** @param {string} message @param {ToastKind} [kind] */
export function toast(message, kind = 'info') {
  const el = ensureToast();
  el.textContent = message;
  el.dataset.kind = kind;
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('is-visible'), 3200);
}

/**
 * @param {string} message
 * @param {{ confirmLabel?: string, cancelLabel?: string }} [opts]
 */
export function confirmAction(message, opts = {}) {
  const el = ensureConfirm();
  const msg = el.querySelector('#app-confirm-msg');
  const okBtn = el.querySelector('[data-confirm-ok]');
  const cancelBtn = el.querySelector('[data-confirm-cancel]');
  if (msg) msg.textContent = message;
  if (okBtn) okBtn.textContent = opts.confirmLabel || 'Confirmar';
  if (cancelBtn) cancelBtn.textContent = opts.cancelLabel || 'Cancelar';
  return new Promise((resolve) => {
    dialogMode = 'confirm';
    dialogResolve = resolve;
    if (typeof el.showModal === 'function') el.showModal();
    else resolve(window.confirm(message));
  });
}

/**
 * @param {string} message
 * @param {string} [defaultValue]
 */
export function promptText(message, defaultValue = '') {
  const el = ensureConfirm();
  const msg = el.querySelector('#app-confirm-msg');
  const okBtn = el.querySelector('[data-confirm-ok]');
  const cancelBtn = el.querySelector('[data-confirm-cancel]');
  const safeDefault = defaultValue.replace(/"/g, '&quot;');
  if (msg) {
    msg.innerHTML = `${message}<input id="app-prompt-input" class="input mt-3 w-full" type="time" value="${safeDefault}" />`;
  }
  if (okBtn) okBtn.textContent = 'Guardar';
  if (cancelBtn) cancelBtn.textContent = 'Cancelar';
  return new Promise((resolve) => {
    dialogMode = 'prompt';
    dialogResolve = resolve;
    if (typeof el.showModal === 'function') {
      el.showModal();
      const input = document.getElementById('app-prompt-input');
      if (input instanceof HTMLInputElement) input.focus();
    } else {
      resolve(window.prompt(message, defaultValue));
    }
  });
}
