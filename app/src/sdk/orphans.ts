import { db } from './storage';
import { INBOX_KEY } from './actions';

// ─────────────────────────────────────────────────────────────────────────────
// Dados de widgets removidos do canvas. Remover um widget não apaga o que ele
// guardou no IndexedDB (permite recuperar um widget removido por engano); esta
// "lixeira" lista esses dados para restaurar o widget ou apagá-los de vez.
// ─────────────────────────────────────────────────────────────────────────────

export interface OrphanData {
  instanceId: string;
  /** Tipo do widget, deduzido do id da instância (`notes-1731…` → `notes`). */
  widgetId: string;
  /** Quantas chaves de dados o widget deixou (sem contar mensagens pendentes). */
  keys: number;
  bytes: number;
  updatedAt: number;
}

export const widgetIdFromInstance = (instanceId: string) => instanceId.replace(/-\d+$/, '');

export async function listOrphanData(activeInstanceIds: Iterable<string>): Promise<OrphanData[]> {
  const active = new Set(activeInstanceIds);
  const groups = new Map<string, OrphanData>();
  await db.kvStore.each((record) => {
    if (active.has(record.instanceId)) return;
    const group = groups.get(record.instanceId) ?? {
      instanceId: record.instanceId,
      widgetId: widgetIdFromInstance(record.instanceId),
      keys: 0,
      bytes: 0,
      updatedAt: 0,
    };
    if (record.key !== INBOX_KEY) group.keys += 1;
    group.bytes += new Blob([JSON.stringify(record.value ?? null)]).size;
    group.updatedAt = Math.max(group.updatedAt, record.updatedAt ?? 0);
    groups.set(record.instanceId, group);
  });
  return [...groups.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteInstanceData(instanceIds: string[]): Promise<void> {
  if (!instanceIds.length) return;
  const keys = await db.kvStore.where('instanceId').anyOf(instanceIds).primaryKeys();
  await db.kvStore.bulkDelete(keys);
}
