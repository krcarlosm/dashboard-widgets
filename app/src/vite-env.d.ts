/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AGENT_HOST?: string;
  readonly VITE_LAUNCHER_PORT?: string;
}

/** Versão do app (package.json), injetada pelo Vite. */
declare const __APP_VERSION__: string;

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'turndown-plugin-gfm' {
  import type TurndownService from 'turndown';
  export const gfm: TurndownService.Plugin;
}