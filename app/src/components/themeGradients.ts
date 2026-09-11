export type ThemeType = 'light' | 'dark';

export type CanvasPreset =
  | 'default'
  | 'ocean'
  | 'sunset'
  | 'midnight'
  | 'drakula'
  | 'batman'
  | 'superman'
  | 'greenlantern'
  | 'whiteMarble'
  | 'blackMarble'
  | 'noir'
  | 'azul'
  | 'violeta'
  | 'esmeralda'
  | 'rosa'
  | 'ambar'
  | 'indigo'
  | 'fearOfTheDark';

export const backgroundMap: Record<CanvasPreset, Record<ThemeType, string>> = {
  default: {
    light: 'radial-gradient(circle at 50% 0%, #ffffff 0%, #f1f5f9 40%, #cbd5e1 100%)',
    dark: 'radial-gradient(circle at 50% 0%, #334155 0%, #1e293b 40%, #0f172a 100%)',
  },
  ocean: {
    light: 'radial-gradient(circle at 50% 0%, #f0f9ff 0%, #e0f2fe 40%, #7dd3fc 100%)',
    dark: 'radial-gradient(circle at 50% 0%, #0284c7 0%, #0c4a6e 40%, #082f49 100%)',
  },
  sunset: {
    light: 'radial-gradient(circle at 50% 0%, #fef3c7 0%, #fed7aa 40%, #f97316 100%)',
    dark: 'radial-gradient(circle at 50% 0%, #ea580c 0%, #7c2d12 40%, #2a0800 100%)',
  },
  midnight: {
    light: 'radial-gradient(circle at 50% 0%, #fdf4ff 0%, #f3e8ff 40%, #c084fc 100%)',
    dark: 'radial-gradient(circle at 50% 0%, #7e22ce 0%, #4c1d95 40%, #170535 100%)',
  },
  drakula: {
    light: 'radial-gradient(circle at 50% 0%, #ffffff 0%, #f8f8f2 40%, #d6d6c2 100%)',
    dark: 'radial-gradient(circle at 50% 0%, #6272a4 0%, #282a36 40%, #191a21 100%)',
  },
  batman: {
    light: 'radial-gradient(circle at 50% 0%, #f3f4f6 0%, #9ca3af 40%, #4b5563 100%)',
    dark: 'radial-gradient(circle at 50% 0%, #374151 0%, #111827 40%, #000000 100%)',
  },
  superman: {
    light: 'radial-gradient(circle at 50% 0%, #eff6ff 0%, #93c5fd 50%, #ef4444 100%)',
    dark: 'radial-gradient(circle at 50% 0%, #1d4ed8 0%, #1e3a8a 40%, #7f1d1d 100%)',
  },
  greenlantern: {
    light: 'radial-gradient(circle at 50% 0%, #f0fdf4 0%, #86efac 40%, #22c55e 100%)',
    dark: 'radial-gradient(circle at 50% 0%, #16a34a 0%, #14532d 40%, #052e16 100%)',
  },
  whiteMarble: {
    light: 'radial-gradient(circle at 50% 0%, #ffffff 0%, #f3f4f6 50%, #d1d5db 100%)',
    dark: 'radial-gradient(circle at 50% 0%, #e5e7eb 0%, #9ca3af 40%, #4b5563 100%)',
  },
  blackMarble: {
    light: 'radial-gradient(circle at 50% 0%, #9ca3af 0%, #4b5563 50%, #1f2937 100%)',
    dark: 'radial-gradient(circle at 50% 0%, #4b5563 0%, #1f2937 40%, #000000 100%)',
  },
  noir: {
    light: 'radial-gradient(circle at 50% 0%, #f5f5f5 0%, #d4d4d4 40%, #737373 100%)',
    dark: 'radial-gradient(circle at 50% 0%, #525252 0%, #262626 40%, #0a0a0a 100%)',
  },
  azul: {
    light: 'radial-gradient(circle at 50% 0%, #e0f2fe 0%, #38bdf8 40%, #0284c7 100%)',
    dark: 'radial-gradient(circle at 50% 0%, #0284c7 0%, #0369a1 40%, #082f49 100%)',
  },
  violeta: {
    light: 'radial-gradient(circle at 50% 0%, #ede9fe 0%, #8b5cf6 40%, #7c3aed 100%)',
    dark: 'radial-gradient(circle at 50% 0%, #7c3aed 0%, #5b21b6 40%, #2e1065 100%)',
  },
  esmeralda: {
    light: 'radial-gradient(circle at 50% 0%, #d1fae5 0%, #34d399 40%, #059669 100%)',
    dark: 'radial-gradient(circle at 50% 0%, #059669 0%, #047857 40%, #022c22 100%)',
  },
  rosa: {
    light: 'radial-gradient(circle at 50% 0%, #ffe4e6 0%, #fb7185 40%, #e11d48 100%)',
    dark: 'radial-gradient(circle at 50% 0%, #e11d48 0%, #be123c 40%, #4c0519 100%)',
  },
  ambar: {
    light: 'radial-gradient(circle at 50% 0%, #fef3c7 0%, #fbbf24 40%, #d97706 100%)',
    dark: 'radial-gradient(circle at 50% 0%, #d97706 0%, #b45309 40%, #451a03 100%)',
  },
  indigo: {
    light: 'radial-gradient(circle at 50% 0%, #e0e7ff 0%, #818cf8 40%, #4f46e5 100%)',
    dark: 'radial-gradient(circle at 50% 0%, #4f46e5 0%, #4338ca 40%, #1e1b4b 100%)',
  },
  fearOfTheDark: {
    light: 'radial-gradient(circle at 50% 0%, #f1f5f9 0%, #cbd5e1 40%, #64748b 100%)',
    dark: 'radial-gradient(circle at 50% 0%, #334155 0%, #0f172a 40%, #020617 100%)',
  }
};