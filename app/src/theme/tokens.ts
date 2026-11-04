import type React from 'react';
import type { ProfileAppearance } from '../types/profile';

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens — a única fonte de cores, tamanhos e espaçamentos do app.
//
// Tudo vira variável CSS no elemento raiz (ver App.tsx) e os componentes e
// widgets usam apenas `var(--...)`. Para mudar uma cor do tema, altere aqui.
//
//   Superfícies  --app-bg, --app-surface, --app-surface-muted, --app-surface-elevated, --app-input
//   Bordas       --app-border, --app-border-strong
//   Texto        --app-text, --app-text-strong, --app-muted, --app-muted-strong, --app-on-accent
//   Semânticas   --app-success | --app-warning | --app-danger (+ -soft para fundos)
//   Acento       --app-accent, --app-accent-strong, --app-accent-soft, --app-accent-border
//   Escalas      --radius-*, --space-*, --font-*, --shadow-card
//
// Dentro de um widget, use --widget-accent* (a cor escolhida para a instância;
// sem cor escolhida, é igual ao acento do app).
// ─────────────────────────────────────────────────────────────────────────────

type TokenSet = Record<string, string>;

export const ACCENTS: Record<ProfileAppearance['accentColor'], { base: string; strong: string; soft: string; border: string }> = {
  sky: { base: '#38bdf8', strong: '#0284c7', soft: 'rgba(56, 189, 248, 0.14)', border: 'rgba(56, 189, 248, 0.4)' },
  violet: { base: '#8b5cf6', strong: '#7c3aed', soft: 'rgba(139, 92, 246, 0.14)', border: 'rgba(139, 92, 246, 0.4)' },
  emerald: { base: '#34d399', strong: '#059669', soft: 'rgba(52, 211, 153, 0.14)', border: 'rgba(52, 211, 153, 0.4)' },
  rose: { base: '#fb7185', strong: '#e11d48', soft: 'rgba(251, 113, 133, 0.14)', border: 'rgba(251, 113, 133, 0.4)' },
  amber: { base: '#fbbf24', strong: '#d97706', soft: 'rgba(251, 191, 36, 0.14)', border: 'rgba(251, 191, 36, 0.4)' },
  indigo: { base: '#818cf8', strong: '#4f46e5', soft: 'rgba(129, 140, 248, 0.14)', border: 'rgba(129, 140, 248, 0.4)' },
};

const THEMES: Record<ProfileAppearance['theme'], TokenSet> = {
  dark: {
    '--app-bg': '#0f172a',
    '--app-surface': '#0f172a',
    '--app-surface-muted': '#111827',
    '--app-surface-elevated': '#1e293b',
    '--app-input': '#0f172a',
    '--app-border': '#334155',
    '--app-border-strong': '#475569',
    '--app-text': '#f8fafc',
    '--app-text-strong': '#f8fafc',
    '--app-muted': '#94a3b8',
    '--app-muted-strong': '#94a3b8',
    '--app-on-accent': '#ffffff',
    '--app-success': '#4ade80',
    '--app-success-soft': 'rgba(74, 222, 128, 0.14)',
    '--app-warning': '#fbbf24',
    '--app-warning-soft': 'rgba(251, 191, 36, 0.14)',
    '--app-danger': '#f87171',
    '--app-danger-soft': 'rgba(248, 113, 113, 0.12)',
    '--shadow-card': '0 8px 32px rgba(0, 0, 0, 0.37)',
  },
  light: {
    '--app-bg': '#f8fafc',
    '--app-surface': '#ffffff',
    '--app-surface-muted': '#f1f5f9',
    '--app-surface-elevated': '#f8fafc',
    '--app-input': '#ffffff',
    '--app-border': '#cbd5e1',
    '--app-border-strong': '#94a3b8',
    '--app-text': '#0f172a',
    '--app-text-strong': '#1e293b',
    '--app-muted': '#475569',
    '--app-muted-strong': '#64748b',
    '--app-on-accent': '#ffffff',
    // Tons mais escuros: os do tema escuro não têm contraste sobre fundo branco.
    '--app-success': '#15803d',
    '--app-success-soft': 'rgba(22, 163, 74, 0.12)',
    '--app-warning': '#b45309',
    '--app-warning-soft': 'rgba(217, 119, 6, 0.12)',
    '--app-danger': '#dc2626',
    '--app-danger-soft': 'rgba(220, 38, 38, 0.08)',
    '--shadow-card': '0 8px 24px rgba(148, 163, 184, 0.25)',
  },
};

const SCALES: TokenSet = {
  '--radius-sm': '4px',
  '--radius-md': '6px',
  '--radius-lg': '8px',
  '--radius-xl': '12px',
  '--space-1': '4px',
  '--space-2': '6px',
  '--space-3': '8px',
  '--space-4': '12px',
  '--font-xs': '10px',
  '--font-sm': '11px',
  '--font-md': '12px',
  '--font-lg': '14px',
  '--font-xl': '20px',
};

// Densidade compacta: o widget inteiro é reduzido (CSS zoom) e a grade usa linhas
// mais baixas na mesma proporção — mais widgets na tela, sem conteúdo cortado.
export const DENSITY = {
  comfortable: { zoom: 1, rowHeight: 80, margin: 12, canvasPadding: 18 },
  compact: { zoom: 0.85, rowHeight: 70, margin: 8, canvasPadding: 8 },
} as const;

export function buildAppearanceStyle(appearance: Pick<ProfileAppearance, 'theme' | 'density' | 'accentColor'>): React.CSSProperties {
  const accent = ACCENTS[appearance.accentColor] ?? ACCENTS.sky;
  return {
    ...SCALES,
    ...THEMES[appearance.theme],
    '--app-accent': accent.base,
    '--app-accent-strong': accent.strong,
    '--app-accent-soft': accent.soft,
    '--app-accent-border': accent.border,
    '--density-zoom': String(DENSITY[appearance.density].zoom),
  } as React.CSSProperties;
}

/** Variáveis --widget-accent* de uma instância (cor própria ou a do app). */
export function widgetAccentStyle(accent?: string): React.CSSProperties {
  if (!accent) {
    return {
      '--widget-accent': 'var(--app-accent)',
      '--widget-accent-strong': 'var(--app-accent-strong)',
      '--widget-accent-soft': 'var(--app-accent-soft)',
      '--widget-accent-border': 'var(--app-accent-border)',
    } as React.CSSProperties;
  }
  return {
    '--widget-accent': accent,
    '--widget-accent-strong': `color-mix(in srgb, ${accent} 70%, black)`,
    '--widget-accent-soft': `color-mix(in srgb, ${accent} 14%, transparent)`,
    '--widget-accent-border': `color-mix(in srgb, ${accent} 40%, transparent)`,
  } as React.CSSProperties;
}

/** Cor com transparência; aceita hex ou var(--...). Ex.: alpha('var(--app-danger)', 20). */
export function alpha(color: string, percent: number): string {
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}
