import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDashboardBackup, db, PROFILE_STORAGE_KEY, restoreDashboardBackup, ScopedWidgetStorage } from './storage';
import { getAutoBackupState, runAutoBackupIfDue } from './autoBackup';
import { confirmAndResetDashboard } from './safeReset';
import { FakeAgentClient } from '../test/harness';

const profile = { schemaVersion: 1, createdAt: '2026-01-01', updatedAt: '2026-01-01', widgets: [{ instanceId: 'notes-1', widgetId: 'notes', layout: { i: 'notes-1', x: 0, y: 0, w: 4, h: 4 }, config: {} }] };

beforeEach(async () => {
  await db.kvStore.clear();
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
});

describe('ScopedWidgetStorage (IndexedDB)', () => {
  it('isola os dados por instância', async () => {
    const a = new ScopedWidgetStorage('notes-1');
    const b = new ScopedWidgetStorage('notes-2');
    await a.set('content', 'da instância A');
    await b.set('content', 'da instância B');
    expect(await a.get('content')).toBe('da instância A');
    expect(await b.get('ausente', 'padrão')).toBe('padrão');
    await a.clear();
    expect(await a.get('content')).toBeUndefined();
    expect(await b.get('content')).toBe('da instância B');
  });
});

describe('Backup e restauração', () => {
  it('backup completo inclui perfil e registros; "somente canvas" não', async () => {
    await new ScopedWidgetStorage('notes-1').set('content', 'texto');
    const full = await createDashboardBackup('canvas-and-data');
    expect(full).toMatchObject({ format: 'dashboard-backup', version: 1, scope: 'canvas-and-data', profile });
    expect(full.records).toHaveLength(1);
    expect((await createDashboardBackup('canvas')).records).toBeUndefined();
  });

  it('restaurar substitui dados e perfil', async () => {
    await new ScopedWidgetStorage('notes-1').set('content', 'antes');
    const backup = await createDashboardBackup('canvas-and-data');
    await new ScopedWidgetStorage('notes-1').set('content', 'depois');
    await new ScopedWidgetStorage('outro').set('x', 1);
    localStorage.setItem(PROFILE_STORAGE_KEY, '{"widgets":[]}');

    await restoreDashboardBackup(backup);
    expect(await new ScopedWidgetStorage('notes-1').get('content')).toBe('antes');
    expect(await new ScopedWidgetStorage('outro').get('x')).toBeUndefined();
    expect(JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY)!)).toEqual(profile);
  });

  it.each([
    [{ format: 'outro' }],
    [{ format: 'dashboard-backup', version: 2, profile }],
    [{ format: 'dashboard-backup', version: 1, scope: 'canvas-and-data', profile }], // sem records
  ])('recusa arquivo inválido sem tocar no estado atual (%#)', async (invalid) => {
    await new ScopedWidgetStorage('notes-1').set('content', 'intacto');
    await expect(restoreDashboardBackup(invalid as any)).rejects.toThrow();
    expect(await new ScopedWidgetStorage('notes-1').get('content')).toBe('intacto');
    expect(JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY)!)).toEqual(profile);
  });

  it('sem perfil salvo não há backup', async () => {
    localStorage.removeItem(PROFILE_STORAGE_KEY);
    await expect(createDashboardBackup('canvas')).rejects.toThrow('Nenhum perfil');
  });
});

describe('Backup automático', () => {
  const status = (due: boolean) => ({ enabled: true, time: '16:30', due, directory: '', keepAuto: 10, lastAuto: null, lastManual: null, lastSlot: '' });

  it('faz backup completo quando o agente diz que está devido', async () => {
    const agent = new FakeAgentClient(true).route('GET', '/backups/status', status(true)).route('POST', '/backups', { skipped: false });
    await runAutoBackupIfDue(agent);
    const post = agent.requests.find((request) => request.method === 'POST')!;
    expect(post.path).toBe('/backups?kind=auto');
    expect(post.body).toMatchObject({ scope: 'canvas-and-data', profile });
    expect(getAutoBackupState()).toMatchObject({ running: false, lastError: null });
  });

  it('não faz nada se não está devido ou o agente está offline', async () => {
    const agent = new FakeAgentClient(true).route('GET', '/backups/status', status(false));
    await runAutoBackupIfDue(agent);
    expect(agent.requests.map((request) => request.method)).toEqual(['GET']);
    const offline = new FakeAgentClient(false);
    await runAutoBackupIfDue(offline);
    expect(offline.requests).toEqual([]);
  });

  it('dashboard novo, sem perfil salvo, não gera erro', async () => {
    localStorage.removeItem(PROFILE_STORAGE_KEY);
    const agent = new FakeAgentClient(true).route('GET', '/backups/status', status(true));
    await runAutoBackupIfDue(agent);
    expect(agent.requests).toEqual([]);
  });

  it('registra o erro para o perfil mostrar', async () => {
    const agent = new FakeAgentClient(true)
      .route('GET', '/backups/status', status(true))
      .route('POST', '/backups', () => {
        throw new Error('Disco cheio');
      });
    await runAutoBackupIfDue(agent);
    expect(getAutoBackupState().lastError).toBe('Disco cheio');
  });
});

describe('Reset Global protegido', () => {
  it('cancelar não apaga nada', async () => {
    const reset = vi.fn();
    expect(await confirmAndResetDashboard(reset, new FakeAgentClient(true), () => false)).toBe(false);
    expect(reset).not.toHaveBeenCalled();
  });

  it('com agente, salva backup manual completo antes de resetar', async () => {
    const reset = vi.fn();
    const agent = new FakeAgentClient(true);
    await confirmAndResetDashboard(reset, agent, () => true);
    expect(agent.saveBackup).toHaveBeenCalledWith(expect.objectContaining({ scope: 'canvas-and-data' }), 'manual');
    expect(reset).toHaveBeenCalled();
  });

  it('falha no backup pergunta de novo antes de apagar', async () => {
    const reset = vi.fn();
    const agent = new FakeAgentClient(true);
    agent.saveBackup.mockRejectedValueOnce(new Error('Agente fora do ar'));
    const answers = [true, false];
    expect(await confirmAndResetDashboard(reset, agent, () => answers.shift()!)).toBe(false);
    expect(reset).not.toHaveBeenCalled();
  });

  it('sem agente, reseta após confirmar', async () => {
    const reset = vi.fn();
    expect(await confirmAndResetDashboard(reset, new FakeAgentClient(false), () => true)).toBe(true);
    expect(reset).toHaveBeenCalled();
  });
});
