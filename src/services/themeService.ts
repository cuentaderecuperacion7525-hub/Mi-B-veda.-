/**
 * Theme service for Bóveda Segura.
 * Supports:
 * - 'cyan': Cian Neón (tecnológico cian/turquesa original)
 * - 'amoled': Negro Puro AMOLED (#000000 absoluto para pantallas OLED)
 * - 'emerald': Esmeralda Seguro (tonos verde esmeralda y menta de alta seguridad)
 * - 'violet': Violeta Cripto (púrpura e índigo sobrio de alta gama)
 * - 'light': Tema Claro (blanco perla limpio de alto contraste y legibilidad)
 */

export type VaultTheme = 'cyan' | 'amoled' | 'emerald' | 'violet' | 'light';

export interface ThemeDefinition {
  id: VaultTheme;
  name: string;
  tagline: string;
  primaryColor: string;
  primaryHover: string;
  glowColor: string;
  bgMain: string;
  bgCard: string;
  bgSecondary: string;
  bgHeader: string;
  bgInput: string;
  textMain: string;
  textMuted: string;
  textSubtle: string;
  borderColor: string;
  isDark: boolean;
}

export const VAULT_THEMES: Record<VaultTheme, ThemeDefinition> = {
  cyan: {
    id: 'cyan',
    name: 'Cian Neón',
    tagline: 'Estilo ciber-tecnológico original',
    primaryColor: '#00e5ff',
    primaryHover: '#00cce6',
    glowColor: 'rgba(0, 229, 255, 0.45)',
    bgMain: '#060b14',
    bgCard: '#0a121d',
    bgSecondary: '#0f172a',
    bgHeader: 'rgba(6, 11, 20, 0.94)',
    bgInput: '#0a121d',
    textMain: '#f8fafc',
    textMuted: '#94a3b8',
    textSubtle: '#64748b',
    borderColor: 'rgba(51, 65, 85, 0.75)',
    isDark: true,
  },
  amoled: {
    id: 'amoled',
    name: 'Negro Puro AMOLED',
    tagline: 'Máximo ahorro de batería OLED (#000000)',
    primaryColor: '#38bdf8',
    primaryHover: '#0ea5e9',
    glowColor: 'rgba(56, 189, 248, 0.45)',
    bgMain: '#000000',
    bgCard: '#09090b',
    bgSecondary: '#141416',
    bgHeader: 'rgba(0, 0, 0, 0.96)',
    bgInput: '#080808',
    textMain: '#ffffff',
    textMuted: '#a1a1aa',
    textSubtle: '#71717a',
    borderColor: '#27272a',
    isDark: true,
  },
  emerald: {
    id: 'emerald',
    name: 'Esmeralda Seguro',
    tagline: 'Tonos verde esmeralda y menta criptográfica',
    primaryColor: '#10b981',
    primaryHover: '#059669',
    glowColor: 'rgba(16, 185, 129, 0.45)',
    bgMain: '#020b06',
    bgCard: '#061a10',
    bgSecondary: '#0a2e1d',
    bgHeader: 'rgba(2, 11, 6, 0.95)',
    bgInput: '#04140c',
    textMain: '#f0fdf4',
    textMuted: '#a7f3d0',
    textSubtle: '#6ee7b7',
    borderColor: 'rgba(16, 185, 129, 0.3)',
    isDark: true,
  },
  violet: {
    id: 'violet',
    name: 'Violeta Cripto',
    tagline: 'Púrpura e índigo sobrio de alta gama',
    primaryColor: '#a855f7',
    primaryHover: '#9333ea',
    glowColor: 'rgba(168, 85, 247, 0.45)',
    bgMain: '#080314',
    bgCard: '#120924',
    bgSecondary: '#1d0f38',
    bgHeader: 'rgba(8, 3, 20, 0.95)',
    bgInput: '#0e061c',
    textMain: '#faf5ff',
    textMuted: '#d8b4fe',
    textSubtle: '#c084fc',
    borderColor: 'rgba(168, 85, 247, 0.3)',
    isDark: true,
  },
  light: {
    id: 'light',
    name: 'Tema Claro',
    tagline: 'Blanco perla ultra limpio y de alto contraste',
    primaryColor: '#0284c7',
    primaryHover: '#0369a1',
    glowColor: 'rgba(2, 132, 199, 0.25)',
    bgMain: '#f1f5f9',
    bgCard: '#ffffff',
    bgSecondary: '#f8fafc',
    bgHeader: 'rgba(255, 255, 255, 0.95)',
    bgInput: '#ffffff',
    textMain: '#0f172a',
    textMuted: '#475569',
    textSubtle: '#64748b',
    borderColor: '#cbd5e1',
    isDark: false,
  },
};

const THEME_STORAGE_KEY = 'vault_app_theme';

class ThemeService {
  private currentTheme: VaultTheme = 'cyan';
  private listeners: Set<(theme: VaultTheme) => void> = new Set();

  constructor() {
    this.init();
  }

  private init() {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY) as VaultTheme;
      if (saved && VAULT_THEMES[saved]) {
        this.currentTheme = saved;
      }
    } catch {}
    this.applyToDom(this.currentTheme);
  }

  public getTheme(): VaultTheme {
    return this.currentTheme;
  }

  public getThemeDefinition(theme?: VaultTheme): ThemeDefinition {
    return VAULT_THEMES[theme || this.currentTheme];
  }

  public setTheme(theme: VaultTheme) {
    if (!VAULT_THEMES[theme]) return;
    this.currentTheme = theme;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {}
    this.applyToDom(theme);
    this.notify();
  }

  public subscribe(cb: (theme: VaultTheme) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify() {
    this.listeners.forEach((cb) => {
      try {
        cb(this.currentTheme);
      } catch (err) {
        console.error('Error notifying theme listener:', err);
      }
    });
    window.dispatchEvent(
      new CustomEvent('vault_theme_changed', { detail: { theme: this.currentTheme } })
    );
  }

  private applyToDom(theme: VaultTheme) {
    if (typeof document === 'undefined') return;
    const def = VAULT_THEMES[theme];
    const root = document.documentElement;

    root.setAttribute('data-theme', theme);
    root.classList.remove('theme-cyan', 'theme-amoled', 'theme-emerald', 'theme-violet', 'theme-light');
    root.classList.add(`theme-${theme}`);

    if (def.isDark) {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
    }

    // Set CSS custom variables
    root.style.setProperty('--theme-bg-main', def.bgMain);
    root.style.setProperty('--theme-bg-card', def.bgCard);
    root.style.setProperty('--theme-bg-secondary', def.bgSecondary);
    root.style.setProperty('--theme-bg-header', def.bgHeader);
    root.style.setProperty('--theme-bg-input', def.bgInput);
    root.style.setProperty('--theme-primary', def.primaryColor);
    root.style.setProperty('--theme-primary-hover', def.primaryHover);
    root.style.setProperty('--theme-glow', def.glowColor);
    root.style.setProperty('--theme-text-main', def.textMain);
    root.style.setProperty('--theme-text-muted', def.textMuted);
    root.style.setProperty('--theme-text-subtle', def.textSubtle);
    root.style.setProperty('--theme-border', def.borderColor);

    // Apply directly to body background & text for instant transition
    if (document.body) {
      document.body.style.backgroundColor = def.bgMain;
      document.body.style.color = def.textMain;
    }

    // Update meta theme-color tag if present
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', def.bgMain);
    }
  }
}

export const themeService = new ThemeService();
