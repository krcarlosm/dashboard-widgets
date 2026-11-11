import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createBus, FakeAgentClient, MemoryStorage, renderWidget } from './harness';
import { mediaAgent, mediaJob } from './mediaAgent';
import { db } from '../sdk/storage';
import type { ActionTarget } from '../sdk/actions';
import { todoWidget } from '../widgets/todo';
import { kanbanWidget } from '../widgets/kanban';
import { notesWidget } from '../widgets/notes';
import { snippetsWidget } from '../widgets/snippets';
import { memoryBauWidget } from '../widgets/memory-bau';
import { editedFilesWidget } from '../widgets/edited-files';
import { mediaDownloaderWidget } from '../widgets/media-downloader';
import { fileConverterWidget } from '../widgets/file-converter';
import { pomodoroWidget } from '../widgets/pomodoro';
import { unitConverterWidget } from '../widgets/unit-converter';
import { noiseWidget } from '../widgets/noise';
import { OrphanDataSection } from '../components/OrphanDataSection';
import { useDashboardStore } from '../store/dashboardStore';

// Fluxos do "Enviar para…" com widgets de verdade montados lado a lado,
// compartilhando o mesmo barramento (como no canvas).

const T = {
  todo: { instanceId: 'todo-1', widgetId: 'todo', title: 'Lista de Tarefas', accepts: ['text', 'task'] },
  kanban: { instanceId: 'kanban-1', widgetId: 'kanban', title: 'Mini-Kanban', accepts: ['text', 'task'] },
  notes: { instanceId: 'notes-1', widgetId: 'notes', title: 'Anotações Rápidas', accepts: ['text', 'file'] },
  snippets: { instanceId: 'snippets-1', widgetId: 'snippets', title: 'Snippets', accepts: ['text'] },
  converter: { instanceId: 'file-converter-1', widgetId: 'file-converter', title: 'Conversor de Arquivos', accepts: ['file'] },
  downloader: { instanceId: 'media-downloader-1', widgetId: 'media-downloader', title: 'Downloader de Vídeos', accepts: ['url'] },
} satisfies Record<string, ActionTarget>;

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const emptyKanban = () => {
  const storage = new MemoryStorage();
  storage.data.set('kanban_items', []);
  return storage;
};

/** Escolhe o destino no menu aberto pelo botão "Enviar…". */
async function sendVia(user: ReturnType<typeof userEvent.setup>, button: HTMLElement, targetTitle: string) {
  await user.click(button);
  const menu = await screen.findByRole('menu');
  await user.click(within(menu).getByRole('menuitem', { name: targetTitle }));
}

beforeEach(async () => {
  await db.kvStore.clear();
});

describe('Todo ↔ Kanban: tarefas vinculadas', () => {
  it('envia, sincroniza conclusão e texto, e desfaz o vínculo ao excluir', async () => {
    const user = userEvent.setup();
    const bus = createBus([T.todo, T.kanban]);
    const todo = renderWidget(todoWidget, { bus, instanceId: T.todo.instanceId });
    const kanban = renderWidget(kanbanWidget, { bus, instanceId: T.kanban.instanceId, storage: emptyKanban() });
    const inTodo = within(todo.container);
    const inKanban = within(kanban.container);

    await user.type(inTodo.getByLabelText('Nova tarefa'), 'Revisar contrato{Enter}');
    await sendVia(user, inTodo.getByRole('button', { name: 'Enviar tarefa para…' }), 'Mini-Kanban');

    expect(await screen.findByText('Enviado para Mini-Kanban.')).toBeInTheDocument();
    const card = await inKanban.findByTestId('kanban-card');
    expect(card).toHaveTextContent('Revisar contrato');
    expect(within(card).getByLabelText('Tarefa vinculada')).toBeInTheDocument();
    expect(inTodo.getByLabelText('Tarefa vinculada')).toBeInTheDocument();

    // Concluir no Kanban conclui na lista…
    await user.click(within(card).getByRole('button', { name: 'Mudar para: Concluído' }));
    await waitFor(() => expect(inTodo.getByRole('checkbox', { name: 'Reabrir "Revisar contrato"' })).toHaveAttribute('aria-checked', 'true'));

    // …e reabrir na lista tira do "Concluído".
    await user.click(inTodo.getByRole('checkbox', { name: 'Reabrir "Revisar contrato"' }));
    await waitFor(() => expect(within(inKanban.getByTestId('kanban-card')).getByRole('button', { name: 'Mudar para: À Fazer' })).toHaveAttribute('aria-pressed', 'true'));

    // "Em andamento" no Kanban não conclui a tarefa.
    await user.click(within(inKanban.getByTestId('kanban-card')).getByRole('button', { name: 'Mudar para: Em Andamento' }));
    expect(inTodo.getByRole('checkbox', { name: 'Concluir "Revisar contrato"' })).toHaveAttribute('aria-checked', 'false');

    // Editar o texto em um muda no outro.
    await user.click(inTodo.getByRole('button', { name: 'Editar tarefa' }));
    const input = inTodo.getByLabelText('Editar texto da tarefa');
    await user.clear(input);
    await user.type(input, 'Revisar contrato v2{Enter}');
    await waitFor(() => expect(inKanban.getByTestId('kanban-card')).toHaveTextContent('Revisar contrato v2'));

    // Excluir no Kanban mantém a tarefa na lista, sem vínculo.
    await user.click(within(inKanban.getByTestId('kanban-card')).getByRole('button', { name: 'Excluir card' }));
    await user.click(within(kanban.container).getByRole('button', { name: /Excluir\? \(Excluir card\)/ }));
    await waitFor(() => expect(inTodo.queryByLabelText('Tarefa vinculada')).not.toBeInTheDocument());
    expect(inTodo.getByText('Revisar contrato v2')).toBeInTheDocument();
    expect(todo.storage.data.get('items')[0].link).toBeUndefined();
  });

  it('Kanban fechado recebe a tarefa quando abrir (caixa de entrada)', async () => {
    const user = userEvent.setup();
    const bus = createBus([T.todo, T.kanban]);
    const todo = renderWidget(todoWidget, { bus, instanceId: T.todo.instanceId });
    await user.type(within(todo.container).getByLabelText('Nova tarefa'), 'Pagar boleto{Enter}');
    await sendVia(user, within(todo.container).getByRole('button', { name: 'Enviar tarefa para…' }), 'Mini-Kanban');
    expect(await screen.findByText('Guardado para Mini-Kanban: aparece quando ele abrir.')).toBeInTheDocument();

    const kanban = renderWidget(kanbanWidget, { bus, instanceId: T.kanban.instanceId, storage: emptyKanban() });
    expect(await within(kanban.container).findByTestId('kanban-card')).toHaveTextContent('Pagar boleto');
    expect(kanban.storage.data.get('kanban_items')[0].link).toEqual({ instanceId: 'todo-1', itemId: todo.storage.data.get('items')[0].id });
  });

  it('Kanban: duplo clique edita o texto do card', async () => {
    const user = userEvent.setup();
    const storage = emptyKanban();
    storage.data.set('kanban_items', [{ id: 'k1', text: 'Rascunho', status: 'todo', createdAt: 1 }]);
    renderWidget(kanbanWidget, { storage });
    await user.dblClick(await screen.findByText('Rascunho'));
    const input = screen.getByLabelText('Editar texto do card');
    await user.clear(input);
    await user.type(input, 'Versão final{Enter}');
    expect(screen.getByText('Versão final')).toBeInTheDocument();
    expect(storage.data.get('kanban_items')[0].text).toBe('Versão final');

    await user.click(screen.getByRole('button', { name: 'Editar card' }));
    await user.type(screen.getByLabelText('Editar texto do card'), ' descartada{Escape}');
    expect(screen.getByText('Versão final')).toBeInTheDocument();
  });
});

describe('Anotações', () => {
  it('envia o trecho selecionado como tarefas (uma por linha)', async () => {
    const user = userEvent.setup();
    const bus = createBus([T.notes, T.todo, T.kanban]);
    const notes = renderWidget(notesWidget, { bus, instanceId: T.notes.instanceId });
    const todo = renderWidget(todoWidget, { bus, instanceId: T.todo.instanceId });

    await waitFor(() => expect(notes.storage.data.get('contentFormat')).toBe('markdown')); // terminou de carregar
    const area = within(notes.container).getByLabelText('Texto da anotação') as HTMLTextAreaElement;
    const text = 'Reunião de segunda\n- revisar orçamento\n- ligar para o fornecedor';
    fireEvent.change(area, { target: { value: text } });
    const sendButton = within(notes.container).getByRole('button', { name: 'Enviar seleção para…' });

    // Sem seleção: avisa.
    area.setSelectionRange(0, 0);
    await sendVia(user, sendButton, 'Lista de Tarefas');
    expect(await screen.findByText('Selecione um trecho da anotação para enviar.')).toBeInTheDocument();

    area.setSelectionRange(text.indexOf('- revisar'), text.length);
    await sendVia(user, sendButton, 'Lista de Tarefas');
    expect(await within(todo.container).findByText('revisar orçamento')).toBeInTheDocument();
    expect(within(todo.container).getByText('ligar para o fornecedor')).toBeInTheDocument();
    expect(within(todo.container).queryByText('Reunião de segunda')).not.toBeInTheDocument();
  });

  it('recebe texto no fim, sem perder o que estava sendo digitado', async () => {
    const bus = createBus([T.notes]);
    const storage = new MemoryStorage();
    storage.data.set('content', 'Linha antiga');
    storage.data.set('contentFormat', 'markdown');
    renderWidget(notesWidget, { bus, instanceId: T.notes.instanceId, storage });
    const area = (await screen.findByDisplayValue('Linha antiga')) as HTMLTextAreaElement;
    fireEvent.change(area, { target: { value: 'Linha antiga + digitando' } });
    await act(() => bus.send('baú', T.notes.instanceId, { kind: 'text', text: 'Do Baú' }));
    expect(area.value).toBe('Linha antiga + digitando\n\nDo Baú');
    await waitFor(() => expect(storage.data.get('content')).toBe('Linha antiga + digitando\n\nDo Baú'));
  });
});

describe('Baú → outros widgets', () => {
  function bauAgent(items: any[]) {
    const agent = new FakeAgentClient(true);
    agent
      .route('GET', '/bau/items', () => ({ items, counts: { text: items.length, image: 0 }, retentionHours: 72, retentionOptions: [24, 48, 72] }))
      .route('GET', /\/bau\/items\/.+\/content$/, { text: 'SELECT *\nFROM pedidos\nWHERE status = 1' });
    return agent;
  }

  it('texto cortado vai completo para os Snippets', async () => {
    const user = userEvent.setup();
    const bus = createBus([T.notes, T.snippets]);
    const bau = renderWidget(memoryBauWidget, {
      bus,
      instanceId: 'memory-bau-1',
      agent: bauAgent([{ id: 'c1.txt', kind: 'text', source: 'clipboard', timestamp: Date.now(), size: 40, preview: 'SELECT *', chars: 40 }]),
    });
    const snippets = renderWidget(snippetsWidget, { bus, instanceId: T.snippets.instanceId });
    await within(bau.container).findByText(/SELECT \*/);
    await sendVia(user, within(bau.container).getByRole('button', { name: 'Enviar texto para…' }), 'Snippets');
    expect(await within(snippets.container).findByText('SELECT *')).toBeInTheDocument(); // título = 1ª linha
    expect(snippets.storage.data.get('snippets')[0]).toMatchObject({ title: 'SELECT *', content: 'SELECT *\nFROM pedidos\nWHERE status = 1', language: 'text' });
  });

  it('um link vai para o Downloader como link (e para as Anotações como texto)', async () => {
    const user = userEvent.setup();
    const url = 'https://www.youtube.com/watch?v=abc123';
    const bus = createBus([T.notes, T.downloader]);
    const bau = renderWidget(memoryBauWidget, {
      bus,
      instanceId: 'memory-bau-1',
      agent: bauAgent([{ id: 'c2.txt', kind: 'text', source: 'clipboard', timestamp: Date.now(), size: url.length, preview: url, chars: url.length }]),
    });
    const { agent } = mediaAgent();
    const downloader = renderWidget(mediaDownloaderWidget, { bus, instanceId: T.downloader.instanceId, agent });
    await within(bau.container).findByText(url);
    await user.click(within(bau.container).getByRole('button', { name: 'Enviar texto para…' }));
    expect(within(await screen.findByRole('menu')).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Anotações Rápidas', 'Downloader de Vídeos']);
    await user.click(screen.getByRole('menuitem', { name: 'Downloader de Vídeos' }));
    await waitFor(() => expect(within(downloader.container).getByLabelText('Link do vídeo')).toHaveValue(url));
    expect(await within(downloader.container).findByText('Aula de Python', {}, { timeout: 3000 })).toBeInTheDocument();
  });
});

describe('Top 10 → Anotações', () => {
  it('vira link que abre o arquivo pelo agente', async () => {
    const user = userEvent.setup();
    const path = 'C:\\Docs\\Relatório [final].docx';
    const agent = new FakeAgentClient(true);
    agent
      .route('GET', '/files/top', {
        items: [{ path, name: 'Relatório [final].docx', folder: 'C:\\Docs', opened: 2, edited: 1, total: 3, lastOpened: Date.now(), lastEdited: null, lastAccess: Date.now() }],
        windowDays: 7,
        folders: [],
      })
      .route('POST', '/files/open', { opened: true, revealed: false });
    const bus = createBus([T.notes, T.converter]);
    const top = renderWidget(editedFilesWidget, { bus, instanceId: 'edited-files-1', agent });
    const notes = renderWidget(notesWidget, { bus, instanceId: T.notes.instanceId, agent });

    await within(top.container).findByText('Relatório [final].docx');
    await sendVia(user, within(top.container).getByRole('button', { name: 'Enviar arquivo para…' }), 'Anotações Rápidas');
    await waitFor(() => expect(notes.storage.data.get('content')).toBe('[📄 Relatório \\[final\\].docx](<file:///C:/Docs/Relatório [final].docx>)'));

    await user.click(within(notes.container).getByRole('button', { name: 'Markdown' }));
    await user.click(within(notes.container).getByRole('link', { name: '📄 Relatório [final].docx' }));
    await waitFor(() => expect(agent.requests.find((request) => request.path === '/files/open')?.body).toEqual({ path: 'C:/Docs/Relatório [final].docx' }));
  });
});

describe('Downloader → Conversor', () => {
  it('o vídeo baixado vai para o Conversor, que converte sem novo envio', async () => {
    const user = userEvent.setup();
    const done = mediaJob({
      kind: 'download',
      title: 'Aula',
      status: 'done',
      progress: 100,
      outputs: [{ path: 'C:\\Users\\eu\\Downloads\\Dashboard\\Aula.mp4', name: 'Aula.mp4', size: 1000 }],
    });
    const { agent } = mediaAgent({ jobs: [done] });
    const bus = createBus([T.notes, T.converter, T.downloader]);
    const downloader = renderWidget(mediaDownloaderWidget, { bus, instanceId: T.downloader.instanceId, agent });
    const converter = renderWidget(fileConverterWidget, { bus, instanceId: T.converter.instanceId, agent });

    const row = await within(downloader.container).findByTestId('media-job');
    await sendVia(user, within(row).getByRole('button', { name: 'Enviar arquivo para…' }), 'Conversor de Arquivos');
    expect(await within(converter.container).findByText('Aula.mp4')).toBeInTheDocument();
    expect(within(converter.container).getByText(/Vídeo · Arquivo do computador/)).toBeInTheDocument();

    await user.selectOptions(within(converter.container).getByLabelText('Formato de saída'), 'mp3');
    await user.click(within(converter.container).getByRole('button', { name: 'Converter arquivo' }));
    const request = agent.requests.find((item) => item.path === '/media/convert-file');
    expect(request?.body).toEqual({ path: 'C:\\Users\\eu\\Downloads\\Dashboard\\Aula.mp4', options: { mode: 'convert', level: 'medium', resolution: 'original', targetFormat: 'mp3' } });
    expect(await within(converter.container).findByTestId('media-job')).toHaveTextContent('Aula.mp4');
    expect(within(converter.container).getByTestId('drop-zone')).toBeInTheDocument();
  });
});

describe('Pomodoro com tarefa em foco', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: false }));
  afterEach(() => vi.useRealTimers());
  const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });

  it('registra o tempo do ciclo de foco na tarefa escolhida', async () => {
    const bus = createBus([T.todo]);
    const todoStorage = new MemoryStorage();
    todoStorage.data.set('items', [
      { id: 't1', text: 'Escrever relatório', done: false, date: today(), createdAt: 1 },
      { id: 't2', text: 'Já feita', done: true, date: today(), createdAt: 2 },
    ]);
    todoStorage.data.set('lastOpenedDate', today());
    const todo = renderWidget(todoWidget, { bus, instanceId: T.todo.instanceId, storage: todoStorage });
    const pomodoro = renderWidget(pomodoroWidget, { bus, instanceId: 'pomodoro-1' });
    await flush();

    fireEvent.click(within(pomodoro.container).getByRole('button', { name: 'Tarefa em foco' }));
    await flush();
    const menu = screen.getByRole('menu', { name: 'Tarefa em foco' });
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Escrever relatório']); // concluídas ficam de fora
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Escrever relatório' }));
    await flush();
    expect(pomodoro.storage.data.get('focusTask')).toEqual({ instanceId: 'todo-1', itemId: 't1', text: 'Escrever relatório' });

    fireEvent.click(within(pomodoro.container).getByTitle('Iniciar'));
    await act(async () => { await vi.advanceTimersByTimeAsync(25 * 60_000); });
    await flush();
    expect(within(pomodoro.container).getByText('Pausa Curta')).toBeInTheDocument();
    expect(within(todo.container).getByText('25 min')).toBeInTheDocument();
    expect(todoStorage.data.get('items').find((item: any) => item.id === 't1').focusSeconds).toBe(1500);
    expect(screen.getByText('25 min registrados em "Escrever relatório".')).toBeInTheDocument();

    fireEvent.click(within(pomodoro.container).getByRole('button', { name: 'Tirar tarefa do foco' }));
    await flush();
    expect(pomodoro.storage.data.get('focusTask')).toBeNull();
  });

  it('sem Lista de Tarefas nem Kanban, explica o que fazer', async () => {
    const pomodoro = renderWidget(pomodoroWidget, { bus: createBus([]) });
    await flush();
    fireEvent.click(within(pomodoro.container).getByRole('button', { name: 'Tarefa em foco' }));
    await flush();
    expect(screen.getByText(/Adicione uma Lista de Tarefas ou um Kanban/)).toBeInTheDocument();
  });
});

describe('Dados de widgets removidos (perfil)', () => {
  it('restaura o widget com os dados ou apaga de vez', async () => {
    const user = userEvent.setup();
    useDashboardStore.setState({ activeInstances: [], registeredWidgets: new Map([['notes', notesWidget], ['todo', todoWidget]]) });
    await db.kvStore.bulkPut([
      { id: 'notes-100:content', instanceId: 'notes-100', key: 'content', value: 'texto guardado', updatedAt: Date.now() },
      { id: 'todo-200:items', instanceId: 'todo-200', key: 'items', value: [], updatedAt: Date.now() - 1000 },
    ]);
    render(<OrphanDataSection />);
    const items = await screen.findAllByTestId('orphan-item');
    expect(items.map((item) => item.textContent?.split('1 item')[0])).toEqual(['Anotações Rápidas', 'Lista de Tarefas']);

    await user.click(within(items[0]).getByRole('button', { name: /Restaurar/ }));
    expect(useDashboardStore.getState().activeInstances.map((instance) => instance.instanceId)).toEqual(['notes-100']);
    await waitFor(() => expect(screen.getAllByTestId('orphan-item')).toHaveLength(1));

    await user.click(screen.getByRole('button', { name: 'Apagar dados de Lista de Tarefas' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Apagar' }));
    expect(await screen.findByText(/Nenhum dado sobrando/)).toBeInTheDocument();
    expect(await db.kvStore.get('todo-200:items')).toBeUndefined();
    expect(await db.kvStore.get('notes-100:content')).toBeDefined();
  });
});

describe('Escolhas lembradas', () => {
  it('Conversor de Unidades volta com a grandeza, unidades e valor', async () => {
    const user = userEvent.setup();
    const view = renderWidget(unitConverterWidget);
    await user.click(screen.getByRole('button', { name: /Temperatura/ }));
    await user.clear(screen.getByPlaceholderText('Digite o valor...'));
    await user.type(screen.getByPlaceholderText('Digite o valor...'), '100');
    await user.click(screen.getByTitle('Trocar sentido'));
    await waitFor(() => expect(view.storage.data.get('state')).toEqual({ category: 'temperature', fromUnit: 'F', toUnit: 'C', inputValue: '100' }));

    view.reload();
    expect(await screen.findByText('37.77777778')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Digite o valor...')).toHaveValue(100);
  });

  it('Ruído volta com os minutos personalizados', async () => {
    const view = renderWidget(noiseWidget);
    await act(async () => { fireEvent.click(screen.getByTitle('Configurações de Temporizador')); });
    await act(async () => { fireEvent.click(screen.getByRole('checkbox')); });
    await act(async () => { fireEvent.change(screen.getByLabelText('Minutos personalizados'), { target: { value: '42' } }); });
    expect(view.storage.data.get('customMinutes')).toBe(42);

    view.reload();
    await act(async () => { fireEvent.click(await screen.findByTitle('Configurações de Temporizador')); });
    expect(screen.getByLabelText('Minutos personalizados')).toHaveValue(42);
  });
});
