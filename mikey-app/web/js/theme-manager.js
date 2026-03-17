/**
 * Mikey情感导师 - Theme Manager
 * Handles light/dark/system theme switching with localStorage persistence
 */
class ThemeManager {
  constructor() {
    this.STORAGE_KEY = 'mikey-theme';
    this.currentTheme = this.getStoredTheme() || 'system';
    this.applyTheme(this.currentTheme);
    this.watchSystemPreference();
    this.initializeToggle();
  }

  getStoredTheme() {
    try {
      return localStorage.getItem(this.STORAGE_KEY);
    } catch {
      return null;
    }
  }

  getSystemTheme() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  applyTheme(theme) {
    this.currentTheme = theme;

    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme');
      try { localStorage.removeItem(this.STORAGE_KEY); } catch {}
    } else {
      document.documentElement.setAttribute('data-theme', theme);
      try { localStorage.setItem(this.STORAGE_KEY, theme); } catch {}
    }

    this.updateToggleUI();
  }

  watchSystemPreference() {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (this.currentTheme === 'system') {
        // Re-trigger CSS by briefly toggling attribute
        document.documentElement.removeAttribute('data-theme');
      }
    });
  }

  initializeToggle() {
    document.addEventListener('click', (e) => {
      const option = e.target.closest('.theme-toggle__option');
      if (option) {
        const newTheme = option.dataset.theme;
        if (newTheme) {
          this.applyTheme(newTheme);
        }
      }
    });
  }

  updateToggleUI() {
    document.querySelectorAll('.theme-toggle__option').forEach(option => {
      const isActive = option.dataset.theme === this.currentTheme;
      option.classList.toggle('theme-toggle__option--active', isActive);
      option.setAttribute('aria-checked', isActive);
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.themeManager = new ThemeManager();
});
