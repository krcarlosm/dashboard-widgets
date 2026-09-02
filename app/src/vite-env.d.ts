/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AGENT_HOST?: string;
  readonly VITE_LAUNCHER_PORT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}