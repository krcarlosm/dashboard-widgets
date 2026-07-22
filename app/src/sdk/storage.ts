import Dexie, { Table } from 'dexie';
import { WidgetStorage } from './types';

export interface StorageRecord {
  id: string; // `${instanceId}:${key}`
  instanceId: string;
  key: string;
  value: any;
  updatedAt: number;
}

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
