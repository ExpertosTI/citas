const STORAGE_KEY = 'citas-theme';

export function getTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function setTheme(theme) {
  const next = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', next === 'dark' ? '#0a0e17' : '#1e3a5f');
  syncToggleUi();
}

export function toggleTheme() {
  setTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

function syncToggleUi() {
  const dark = getTheme() === 'dark';
  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    btn.setAttribute('aria-label', dark ? 'Modo claro' : 'Modo oscuro');
    btn.setAttribute('title', dark ? 'Modo claro' : 'Modo oscuro');
    btn.dataset.themeState = dark ? 'dark' : 'light';
  });
}

export function initThemeToggle() {
  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    if (btn.dataset.themeBound === '1') return;
    btn.dataset.themeBound = '1';
    btn.addEventListener('click', toggleTheme);
  });
  syncToggleUi();
}
