import { createDashboardBackup } from './storage';
import type { AgentClientProtocol } from './types';

// Backup automático diário. Os dados vivem no navegador (IndexedDB + localStorage),
// então é o app que gera o arquivo; o agente guarda o horário, diz se o backup
// está "devido" e mantém só os 10 automáticos mais recentes.
//
// Regra: se o último horário agendado (ex.: 16:30) já passou e não existe backup
// automático depois dele, faz agora. Verificado ao abrir o app, a cada minuto e
// quando o agente reconecta — assim um dia perdido é recuperado no dia seguinte.

export interface BackupStatus {
  enabled: boolean;
  time: string;
  directory: string;
  keepAuto: number;
  lastAuto: string | null;
  lastManual: string | null;
  lastSlot: string;
  due: boolean;
}

export interface AutoBackupState {
  running: boolean;
  lastAttemptAt: string | null;
  lastError: string | null;
}

const CHECK_INTERVAL_MS = 60_000;

let state: AutoBackupState = { running: false, lastAttemptAt: null, lastError: null };
const listeners = new Set<(next: AutoBackupState) => void>();

function setState(patch: Partial<AutoBackupState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener(state));
}

export function getAutoBackupState(): AutoBackupState {
  return state;
}

export function subscribeAutoBackup(listener: (next: AutoBackupState) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function runAutoBackupIfDue(client: AgentClientProtocol): Promise<void> {
  if (state.running || !client.isConnected) return;

  let status: BackupStatus;
  try {
    status = await client.requestJson<BackupStatus>('/backups/status');
  } catch {
    return; // agente fora do ar: tenta de novo no próximo ciclo
  }
  if (!status.due) return;

  setState({ running: true, lastAttemptAt: new Date().toISOString() });
  try {
    const backup = await createDashboardBackup('canvas-and-data');
    await client.requestJson('/backups?kind=auto', { method: 'POST', body: JSON.stringify(backup) });
    setState({ running: false, lastError: null });
  } catch (error) {
    setState({ running: false, lastError: error instanceof Error ? error.message : 'Falha no backup automático.' });
  }
}

export function startAutoBackupScheduler(client: AgentClientProtocol): () => void {
  const check = () => void runAutoBackupIfDue(client);
  const interval = window.setInterval(check, CHECK_INTERVAL_MS);
  // onStatusChange já chama o listener com o estado atual: cobre a abertura do app.
  const unsubscribe = client.onStatusChange((connected) => {
    if (connected) check();
  });
  return () => {
    window.clearInterval(interval);
    unsubscribe();
  };
}
