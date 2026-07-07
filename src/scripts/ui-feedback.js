/** @typedef {'info' | 'success' | 'error'} ToastKind */

import { bindTime12hFields } from '../lib/time-12h.ts';

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
      const wrap = document.querySelector('#app-confirm-msg .time-12h');
      if (wrap) bindTime12hFields(wrap);
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
 * @param {string} [defaultValue] HH:MM 24h
 */
export function promptTime12(message, defaultValue = '10:00') {
  const el = ensureConfirm();
  const msg = el.querySelector('#app-confirm-msg');
  const okBtn = el.querySelector('[data-confirm-ok]');
  const cancelBtn = el.querySelector('[data-confirm-cancel]');
  const [hStr, mStr = '00'] = defaultValue.split(':');
  const h24 = Number(hStr);
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const hours = Array.from({ length: 12 }, (_, i) => i + 1);
  const minutes = ['00', '15', '30', '45'];
  const hourOpts = hours.map((n) => `<option value="${n}"${n === h12 ? ' selected' : ''}>${n}</option>`).join('');
  const minOpts = minutes.map((m) => `<option value="${m}"${m === mStr ? ' selected' : ''}>${m}</option>`).join('');
  if (msg) {
    msg.innerHTML = `${message}<div class="time-12h mt-3"><div class="time-12h__row">
      <select id="app-prompt-input-h" class="input time-12h__select" data-time-part="h">${hourOpts}</select>
      <span class="time-12h__sep">:</span>
      <select id="app-prompt-input-m" class="input time-12h__select time-12h__min" data-time-part="m">${minOpts}</select>
      <select id="app-prompt-input-p" class="input time-12h__select time-12h__period" data-time-part="period">
        <option value="AM"${period === 'AM' ? ' selected' : ''}>AM</option>
        <option value="PM"${period === 'PM' ? ' selected' : ''}>PM</option>
      </select>
      <input type="hidden" id="app-prompt-input" data-time-hidden value="${defaultValue}" />
    </div></div>`;
  }
  if (okBtn) okBtn.textContent = 'Guardar';
  if (cancelBtn) cancelBtn.textContent = 'Cancelar';
  return new Promise((resolve) => {
    dialogMode = 'prompt';
    dialogResolve = resolve;
    if (typeof el.showModal === 'function') {
      el.showModal();
      const wrap = msg?.querySelector('.time-12h');
      if (wrap) bindTime12hFields(wrap);
      document.getElementById('app-prompt-input-h')?.focus();
    } else {
      resolve(window.prompt(message, defaultValue));
    }
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
