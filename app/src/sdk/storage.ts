import Dexie, { Table } from 'dexie';
import { WidgetStorage } from './types';
import type { ProfileManifest } from '../types/profile';

export interface StorageRecord {
  id: string; // `${instanceId}:${key}`
  instanceId: string;
  key: string;
  value: any;
  updatedAt: number;
}

export type BackupScope = 'canvas' | 'canvas-and-data';

export interface DashboardBackup {
  format: 'dashboard-backup';
  version: 1;
  scope: BackupScope;
  exportedAt: string;
  profile: ProfileManifest;
  records?: StorageRecord[];
}

export const PROFILE_STORAGE_KEY = 'dashboard_profile_v1';

class DashboardDatabase extends Dexie {
  kvStore!: Table<StorageRecord, string>;

  constructor() {
    super('DashboardWidgetsDB');
    this.version(1).stores({
      kvStore: 'id, instanceId, key, updatedAt',
    });
  }
}

export const db = new DashboardDatabase();

export async function createDashboardBackup(scope: BackupScope): Promise<DashboardBackup> {
  const rawProfile = localStorage.getItem(PROFILE_STORAGE_KEY);
  if (!rawProfile) {
    throw new Error('Nenhum perfil do dashboard foi encontrado.');
  }

  const profile = JSON.parse(rawProfile) as ProfileManifest;
  const backup: DashboardBackup = {
    format: 'dashboard-backup',
    version: 1,
    scope,
    exportedAt: new Date().toISOString(),
    profile,
  };

  if (scope === 'canvas-and-data') {
    backup.records = await db.kvStore.toArray();
  }

  return backup;
}

export async function restoreDashboardBackup(backup: DashboardBackup): Promise<void> {
  if (backup.format !== 'dashboard-backup' || backup.version !== 1 || !backup.profile || !Array.isArray(backup.profile.widgets)) {
    throw new Error('Arquivo de recuperação inválido ou incompatível.');
  }

  if (backup.scope === 'canvas-and-data' && !Array.isArray(backup.records)) {
    throw new Error('O arquivo completo não contém os dados dos widgets.');
  }

  const records = backup.records;

  // Dados primeiro, em transação: se a gravação falhar, nada é apagado
  // e o perfil atual permanece intacto.
  if (backup.scope === 'canvas-and-data') {
    await db.transaction('rw', db.kvStore, async () => {
      await db.kvStore.clear();
      await db.kvStore.bulkPut(records!);
    });
  }

  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(backup.profile));
}

export class ScopedWidgetStorage implements WidgetStorage {
  private instanceId: string;

  constructor(instanceId: string) {
    this.instanceId = instanceId;
  }

  private makeId(key: string): string {
    return `${this.instanceId}:${key}`;
  }

  async get<T = any>(key: string, defaultValue?: T): Promise<T | undefined> {
    try {
      const record = await db.kvStore.get(this.makeId(key));
      if (!record) return defaultValue;
      return record.value as T;
    } catch (err) {
      console.error(`[Storage Error] Fail to get ${key} for instance ${this.instanceId}`, err);
      return defaultValue;
    }
  }

  async set<T = any>(key: string, value: T): Promise<void> {
    try {
      await db.kvStore.put({
        id: this.makeId(key),
        instanceId: this.instanceId,
        key,
        value,
        updatedAt: Date.now(),
      });
    } catch (err) {
      console.error(`[Storage Error] Fail to set ${key} for instance ${this.instanceId}`, err);
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await db.kvStore.delete(this.makeId(key));
    } catch (err) {
      console.error(`[Storage Error] Fail to remove ${key} for instance ${this.instanceId}`, err);
    }
  }

  async clear(): Promise<void> {
    try {
      const keys = await db.kvStore
        .where('instanceId')
        .equals(this.instanceId)
        .primaryKeys();
      await db.kvStore.bulkDelete(keys);
    } catch (err) {
      console.error(`[Storage Error] Fail to clear storage for instance ${this.instanceId}`, err);
    }
  }
}
