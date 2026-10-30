import { beforeEach, describe, expect, it } from 'vitest';
import { useDashboardStore } from './dashboardStore';
import { db, PROFILE_STORAGE_KEY, ScopedWidgetStorage } from '../sdk/storage';
import { notesWidget } from '../widgets/notes';
import { todoWidget } from '../widgets/todo';
import { kanbanWidget } from '../widgets/kanban';

const store = () => useDashboardStore.getState();
const saved = () => JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY)!);

beforeEach(() => {
  localStorage.clear();
  useDashboardStore.setState({ activeInstances: [], registeredWidgets: new Map() });
  [notesWidget, todoWidget, kanbanWidget].forEach((widget) => store().registerWidget(widget as any));
});

describe('Store do dashboard', () => {
  it('adiciona widgets lado a lado e salva o perfil', () => {
    store().addWidgetToCanvas('notes'); // 4 colunas
    store().addWidgetToCanvas('todo'); // 4 colunas
    store().addWidgetToCanvas('kanban'); // 5 colunas: não cabe na linha (4+4+5 > 12)
    const layouts = store().activeInstances.map((instance) => [instance.widgetId, instance.layout.x, instance.layout.y]);
    expect(layouts[0]).toEqual(['notes', 0, 0]);
    expect(layouts[1]).toEqual(['todo', 4, 0]);
    expect(layouts[2][1]).toBe(0);
    expect(layouts[2][2]).toBeGreaterThan(0);
    expect(saved().widgets).toHaveLength(3);
  });

  it('ignora widget não registrado', () => {
    store().addWidgetToCanvas('inexistente');
    expect(store().activeInstances).toEqual([]);
  });

  it('widget travado não se move ao reorganizar nem ao arrastar', () => {
    store().addWidgetToCanvas('notes');
    store().addWidgetToCanvas('todo');
    const [notes, todo] = store().activeInstances;
    store().updateLayout([{ i: todo.instanceId, x: 8, y: 6, w: 4, h: 5 }]);
    store().toggleLockWidget(todo.instanceId);
    store().updateLayout([{ i: todo.instanceId, x: 0, y: 20, w: 4, h: 5 }]);
    expect(store().activeInstances[1].layout).toMatchObject({ x: 8, y: 6 });

    store().removeWidgetFromCanvas(notes.instanceId);
    store().reorganizeLayouts();
    expect(store().activeInstances[0].layout).toMatchObject({ x: 8, y: 6 });
  });

  it('configuração e cor por instância são persistidas', () => {
    store().addWidgetToCanvas('notes');
    const id = store().activeInstances[0].instanceId;
    store().updateWidgetConfig(id, { filter: 'all' });
    store().updateWidgetConfig(id, { topN: 10 });
    store().setWidgetColorPreset(id, 'rose');
    expect(saved().widgets[0]).toMatchObject({ config: { filter: 'all', topN: 10 }, colorPreset: 'rose' });
  });

  it('carrega o perfil salvo e corrige aparência inválida', () => {
    localStorage.setItem(
      PROFILE_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, createdAt: '2025-05-05', widgets: [], appearance: { theme: 'roxo', density: 'compact', accentColor: 'neon', canvasPreset: 'naoexiste' } }),
    );
    store().loadProfile();
    expect(store()).toMatchObject({ theme: 'dark', density: 'compact', accentColor: 'sky', canvasPreset: 'batman', profileCreatedAt: '2025-05-05' });
  });

  it('perfil corrompido não quebra o carregamento', () => {
    localStorage.setItem(PROFILE_STORAGE_KEY, '{ isto não é json');
    store().loadProfile();
    expect(store().activeInstances).toEqual([]);
    expect(store().isLoaded).toBe(true);
  });

  it('aparência é salva e o "criado em" do perfil se mantém', () => {
    store().loadProfile();
    const createdAt = store().profileCreatedAt;
    store().setAppearance({ theme: 'light', accentColor: 'violet' });
    expect(saved()).toMatchObject({ createdAt, appearance: { theme: 'light', accentColor: 'violet' } });
  });

  it('reset limpa canvas, perfil e dados dos widgets', async () => {
    store().addWidgetToCanvas('notes');
    await new ScopedWidgetStorage('x').set('k', 1);
    store().resetDashboard();
    expect(store().activeInstances).toEqual([]);
    expect(localStorage.getItem(PROFILE_STORAGE_KEY)).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await db.kvStore.count()).toBe(0);
  });
});
