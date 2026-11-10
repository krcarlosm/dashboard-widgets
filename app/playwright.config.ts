import { defineConfig, devices } from '@playwright/test';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

// Smoke E2E no motor Firefox (o Zen é baseado nele). Sobe um agente isolado
// (pasta temporária, porta própria, sem monitor da área de transferência) e
// o Vite apontando para ele — nada toca o agente ou os dados do dia a dia.

const here = path.dirname(fileURLToPath(import.meta.url));
const AGENT_PORT = 5299;
const APP_PORT = 4173;
process.env.DASHBOARD_E2E_DIR ??= path.join(os.tmpdir(), `dashboard-e2e-${process.pid}`);
const sandbox = process.env.DASHBOARD_E2E_DIR;
const agentDir = path.resolve(here, '../agent');
const python = path.join(agentDir, process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python');

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  globalTeardown: './e2e/teardown.ts',
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Padrão: motor Firefox (o mesmo do Zen). `npx playwright install firefox` uma vez.
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } } },
    // Alternativa para máquinas que bloqueiam os binários não assinados do Playwright
    // (ex.: notebook corporativo): usa o Microsoft Edge instalado. --project=edge
    { name: 'edge', use: { ...devices['Desktop Edge'], channel: 'msedge', viewport: { width: 1440, height: 900 } } },
  ],
  webServer: [
    {
      command: `"${python}" -m src.main`,
      cwd: agentDir,
      url: `http://127.0.0.1:${AGENT_PORT}/`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        DASHBOARD_AGENT_PORT: String(AGENT_PORT),
        DASHBOARD_AGENT_HOME: path.join(sandbox, 'home'),
        DASHBOARD_BACKUP_DIR: path.join(sandbox, 'backups'),
        DASHBOARD_AUTOSTART_DIR: path.join(sandbox, 'startup'),
        DASHBOARD_MEDIA_DIR: path.join(sandbox, 'media'),
        // O teste do Downloader usa um servidor HTTP local; nunca passa por proxy.
        NO_PROXY: '127.0.0.1,localhost',
        no_proxy: '127.0.0.1,localhost',
        DASHBOARD_AGENT_CLIPBOARD: '0',
        ALLOWED_ORIGINS: `http://localhost:${APP_PORT},http://127.0.0.1:${APP_PORT}`,
      },
    },
    {
      command: `npx vite --port ${APP_PORT} --strictPort`,
      url: `http://localhost:${APP_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        VITE_AGENT_WS_URL: `ws://127.0.0.1:${AGENT_PORT}/ws`,
        VITE_AGENT_HTTP_URL: `http://127.0.0.1:${AGENT_PORT}`,
      },
    },
  ],
});
