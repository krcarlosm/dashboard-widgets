import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './storage';
import { ActionBus, INBOX_KEY, formatFocus, textToTasks, type ActionTarget, type WidgetMessage } from './actions';
import { buildActionTargets } from '../store/dashboardStore';
import { deleteInstanceData, listOrphanData, widgetIdFromInstance } from './orphans';
import type { WidgetDefinition } from './types';

const TARGETS: ActionTarget[] = [
  { instanceId: 'todo-1', widgetId: 'todo', title: 'Lista de Tarefas', accepts: ['text', 'task'] },
  { instanceId: 'notes-1', widgetId: 'notes', title: 'Anotações Rápidas', accepts: ['text', 'file'] },
  { instanceId: 'media-downloader-1', widgetId: 'media-downloader', title: 'Downloader de Vídeos', accepts: ['url'] },
];

function makeBus() {
  const bus = new ActionBus();
  bus.setTargetsProvider(() => TARGETS);
  return bus;
}

beforeEach(async () => {
  await db.kvStore.clear();
});

describe('Barramento do "Enviar para…"', () => {
  it('lista só quem aceita o tipo, sem a própria instância', () => {
    const bus = makeBus();
    expect(bus.targets('todo-1', 'text').map((t) => t.instanceId)).toEqual(['notes-1']);
    expect(bus.targets('baú', ['text', 'url']).map((t) => t.instanceId)).toEqual(['todo-1', 'notes-1', 'media-downloader-1']);
    expect(bus.targets('x', 'file').map((t) => t.instanceId)).toEqual(['notes-1']);
  });

  it('entrega na hora a quem está aberto, com a origem', async () => {
    const bus = makeBus();
    const received: [WidgetMessage, string][] = [];
    bus.register('notes-1', (message, from) => {
      received.push([message, from.title]);
    });
    const result = await bus.send('todo-1', 'notes-1', { kind: 'text', text: 'oi' });
    expect(result).toEqual({ queued: false });
    expect(received).toEqual([[{ kind: 'text', text: 'oi' }, 'Lista de Tarefas']]);
  });

  it('guarda para quem está fechado e entrega, em ordem, quando abrir', async () => {
    const bus = makeBus();
    expect(await bus.send('notes-1', 'todo-1', { kind: 'text', text: 'um' })).toEqual({ queued: true });
    await bus.send('notes-1', 'todo-1', { kind: 'text', text: 'dois' });
    const stored = await db.kvStore.get(`todo-1:${INBOX_KEY}`);
    expect(stored?.value).toHaveLength(2);

    const received: string[] = [];
    bus.register('todo-1', (message) => {
      if (message.kind === 'text') received.push(message.text);
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(received).toEqual(['um', 'dois']);
    expect(await db.kvStore.get(`todo-1:${INBOX_KEY}`)).toBeUndefined();
  });

  it('se fechar de novo antes de receber, a mensagem volta para a caixa', async () => {
    const bus = makeBus();
    await bus.send('notes-1', 'todo-1', { kind: 'text', text: 'pendente' });
    const unregister = bus.register('todo-1', () => {});
    unregister();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect((await db.kvStore.get(`todo-1:${INBOX_KEY}`))?.value).toHaveLength(1);
  });

  it('consulta direta só a instâncias abertas', async () => {
    const bus = makeBus();
    expect(await bus.request('todo-1', { type: 'tasks:list' })).toBeNull();
    const stop = bus.respond('todo-1', () => [{ id: 'a', text: 'Tarefa', done: false }]);
    expect(await bus.request('todo-1', { type: 'tasks:list' })).toEqual([{ id: 'a', text: 'Tarefa', done: false }]);
    stop();
    expect(await bus.request('todo-1', { type: 'tasks:list' })).toBeNull();
  });

  it('texto vira tarefas: uma por linha, sem marcadores de lista', () => {
    expect(textToTasks('- comprar pão\n* [ ] ligar para o João\n\n1. revisar\n  2) enviar  \n[x] pronto\nnormal')).toEqual([
      'comprar pão',
      'ligar para o João',
      'revisar',
      'enviar',
      'pronto',
      'normal',
    ]);
    expect(textToTasks('   \n\n')).toEqual([]);
    expect(textToTasks(Array.from({ length: 80 }, (_, i) => `t${i}`).join('\n'))).toHaveLength(50);
  });

  it('tempo de foco', () => {
    expect(formatFocus(25 * 60)).toBe('25 min');
    expect(formatFocus(75 * 60)).toBe('1 h 15 min');
    expect(formatFocus(120 * 60)).toBe('2 h');
  });
});

describe('Destinos a partir do canvas', () => {
  const definition = (id: string, name: string, accepts?: any[]) => ({ manifest: { id, name, accepts } }) as unknown as WidgetDefinition;
  const registered = new Map([
    ['notes', definition('notes', 'Anotações Rápidas', ['text', 'file'])],
    ['todo', definition('todo', 'Lista de Tarefas', ['text', 'task'])],
    ['hello-world', definition('hello-world', 'Hello World')],
  ]);
  const instance = (instanceId: string, widgetId: string, config: Record<string, any> = {}) => ({ instanceId, widgetId, layout: { i: instanceId, x: 0, y: 0, w: 1, h: 1 }, config });

  it('usa título personalizado e numera nomes repetidos', () => {
    const targets = buildActionTargets({
      registeredWidgets: registered,
      activeInstances: [
        instance('notes-1', 'notes'),
        instance('hello-world-1', 'hello-world'),
        instance('notes-2', 'notes'),
        instance('todo-1', 'todo', { customTitle: 'Trabalho' }),
        instance('todo-2', 'todo'),
      ],
    });
    expect(targets.map((t) => t.title)).toEqual(['Anotações Rápidas (1)', 'Anotações Rápidas (2)', 'Trabalho', 'Lista de Tarefas']);
  });
});

describe('Dados de widgets removidos', () => {
  it('lista e apaga só o que não está no canvas', async () => {
    await db.kvStore.bulkPut([
      { id: 'notes-1:content', instanceId: 'notes-1', key: 'content', value: 'ativo', updatedAt: 1 },
      { id: 'notes-2:content', instanceId: 'notes-2', key: 'content', value: 'órfão', updatedAt: 5 },
      { id: 'notes-2:mode', instanceId: 'notes-2', key: 'mode', value: 'plain', updatedAt: 9 },
      { id: `kanban-77:${INBOX_KEY}`, instanceId: 'kanban-77', key: INBOX_KEY, value: [], updatedAt: 3 },
    ]);
    const orphans = await listOrphanData(['notes-1']);
    expect(orphans.map((o) => [o.instanceId, o.widgetId, o.keys, o.updatedAt])).toEqual([
      ['notes-2', 'notes', 2, 9],
      ['kanban-77', 'kanban', 0, 3],
    ]);
    await deleteInstanceData(['notes-2']);
    expect((await listOrphanData(['notes-1'])).map((o) => o.instanceId)).toEqual(['kanban-77']);
    expect(await db.kvStore.get('notes-1:content')).toBeDefined();
  });

  it('deduz o tipo do id da instância', () => {
    expect(widgetIdFromInstance('media-downloader-1731000000000')).toBe('media-downloader');
    expect(widgetIdFromInstance('todo')).toBe('todo');
  });
});
