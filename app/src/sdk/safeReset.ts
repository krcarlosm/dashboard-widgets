import { createDashboardBackup } from './storage';
import type { AgentClientProtocol } from './types';

export const RESET_CONFIRMATION =
  'O Reset Global remove todos os widgets do canvas e APAGA os dados deles (anotações, tarefas, snippets, kanban…).\n\n' +
  'Com o agente local ativo, um backup manual é salvo antes. Continuar?';

/**
 * Reset Global com proteção: pede confirmação e, se o agente estiver conectado,
 * grava um backup completo antes de apagar. Devolve true se o reset aconteceu.
 */
export async function confirmAndResetDashboard(
  reset: () => void,
  agent: AgentClientProtocol,
  confirm: (message: string) => boolean = (message) => window.confirm(message),
): Promise<boolean> {
  if (!confirm(RESET_CONFIRMATION)) return false;

  if (agent.isConnected && agent.saveBackup) {
    try {
      await agent.saveBackup(await createDashboardBackup('canvas-and-data'), 'manual');
    } catch (error) {
      // Sem perfil salvo não há o que proteger; qualquer outra falha cancela o reset.
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('Nenhum perfil')) {
        if (!confirm(`Não foi possível salvar o backup de segurança (${message}). Resetar mesmo assim?`)) return false;
      }
    }
  }

  reset();
  return true;
}
