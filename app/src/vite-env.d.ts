/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AGENT_HOST?: string;
  readonly VITE_LAUNCHER_PORT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'turndown-plugin-gfm' {
  import type TurndownService from 'turndown';
  export const gfm: TurndownService.Plugin;
}