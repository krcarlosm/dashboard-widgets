import { describe, expect, it } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { todoWidget } from './index';
import { MemoryStorage, renderWidget } from '../../test/harness';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const task = (id: string, text: string, extra: Partial<{ done: boolean; date: string }> = {}) => ({
  id,
  text,
  done: false,
  date: today(),
  createdAt: 1,
  ...extra,
});

const visibleTexts = () =>
  Array.from(document.querySelectorAll('[draggable]')).map((row) => row.querySelector('span')?.textContent);

async function addTask(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(screen.getByPlaceholderText('Adicionar nova tarefa...'), `${text}{Enter}`);
}

describe('Lista de Tarefas', () => {
  it('adiciona tarefas e persiste após recarregar', async () => {
    const user = userEvent.setup();
    const view = renderWidget(todoWidget);
    await addTask(user, 'Revisar relatório');
    await addTask(user, '   ');
    expect(visibleTexts()).toEqual(['Revisar relatório']);

    view.reload();
    expect(await screen.findByText('Revisar relatório')).toBeInTheDocument();
    expect(screen.getByText('0 / 1 concluídas')).toBeInTheDocument();
  });

  it('concluir pela caixa move a tarefa para o fim; reabrir volta para as pendentes', async () => {
    const user = userEvent.setup();
    const storage = new MemoryStorage();
    await storage.set('items', [task('a', 'A'), task('b', 'B'), task('c', 'C')]);
    renderWidget(todoWidget, { storage });
    await screen.findByText('A');

    await user.click(screen.getByRole('checkbox', { name: 'Concluir "A"' }));
    expect(visibleTexts()).toEqual(['B', 'C', 'A']);
    expect(screen.getByText('1 / 3 concluídas')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Reabrir "A"' }));
    expect(visibleTexts()).toEqual(['B', 'C', 'A']);
    expect((await storage.get<any[]>('items'))!.every((item) => !item.done)).toBe(true);
  });

  it('clique simples no texto conclui', async () => {
    const user = userEvent.setup();
    const storage = new MemoryStorage();
    await storage.set('items', [task('a', 'A'), task('b', 'B')]);
    renderWidget(todoWidget, { storage });
    await user.click(await screen.findByText('A'));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Reabrir "A"' })).toBeInTheDocument());
  });

  it('duplo clique edita sem concluir nem mudar a ordem', async () => {
    const user = userEvent.setup();
    const storage = new MemoryStorage();
    await storage.set('items', [task('a', 'A'), task('b', 'B')]);
    renderWidget(todoWidget, { storage });
    await user.dblClick(await screen.findByText('A'));
    const input = screen.getByRole('textbox', { name: 'Editar texto da tarefa' });
    await user.click(input); // clicar dentro do campo não pode concluir
    await user.clear(input);
    await user.type(input, 'A editada{Enter}');
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(visibleTexts()).toEqual(['A editada', 'B']);
    expect(screen.getByText('0 / 2 concluídas')).toBeInTheDocument();
  });

  it('Esc cancela a edição e texto vazio não apaga a tarefa', async () => {
    const user = userEvent.setup();
    const storage = new MemoryStorage();
    await storage.set('items', [task('a', 'Original')]);
    renderWidget(todoWidget, { storage });
    await user.click(await screen.findByTitle('Editar tarefa'));
    await user.type(screen.getByRole('textbox', { name: 'Editar texto da tarefa' }), ' mudou{Escape}');
    expect(screen.getByText('Original')).toBeInTheDocument();

    await user.click(screen.getByTitle('Editar tarefa'));
    await user.clear(screen.getByRole('textbox', { name: 'Editar texto da tarefa' }));
    await user.keyboard('{Enter}');
    expect(screen.getByText('Original')).toBeInTheDocument();
  });

  it('exclui tarefa só após confirmar (segundo clique)', async () => {
    const user = userEvent.setup();
    const storage = new MemoryStorage();
    await storage.set('items', [task('a', 'A')]);
    renderWidget(todoWidget, { storage });
    await user.click(await screen.findByRole('button', { name: 'Excluir tarefa' }));
    expect(screen.getByText('A')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Excluir? (Excluir tarefa)' }));
    expect(screen.getByText('Nenhuma tarefa cadastrada.')).toBeInTheDocument();
    expect(await storage.get('items')).toEqual([]);
  });

  it('"Hoje" mostra só as do dia; "Todas" inclui as antigas', async () => {
    const user = userEvent.setup();
    const storage = new MemoryStorage();
    await storage.set('items', [task('a', 'Hoje'), task('b', 'Antiga', { date: '2020-01-01', done: true })]);
    renderWidget(todoWidget, { storage });
    await screen.findByText('Hoje', { selector: 'span' });
    expect(screen.queryByText('Antiga')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Todas / Semana' }));
    expect(screen.getByText('Antiga')).toBeInTheDocument();
  });

  it('virada do dia oferece mover pendentes antigas para hoje', async () => {
    const user = userEvent.setup();
    const storage = new MemoryStorage();
    await storage.set('items', [task('a', 'Ontem pendente', { date: '2020-01-01' }), task('b', 'Ontem feita', { date: '2020-01-01', done: true })]);
    await storage.set('lastOpenedDate', '2020-01-01');
    renderWidget(todoWidget, { storage });
    const banner = (await screen.findByText(/1 tarefas pendentes de dias anteriores/)).closest('div')!.parentElement!;
    await user.click(within(banner).getByRole('button', { name: 'Mover para Hoje' }));
    expect(screen.getByText('Ontem pendente')).toBeInTheDocument();
    expect(await storage.get('lastOpenedDate')).toBe(today());
  });

  it('arrastar reordena dentro do mesmo grupo e persiste', async () => {
    const storage = new MemoryStorage();
    await storage.set('items', [task('a', 'A'), task('b', 'B'), task('c', 'C'), task('d', 'D', { done: true })]);
    renderWidget(todoWidget, { storage });
    await screen.findByText('A');
    const rows = () => Array.from(document.querySelectorAll('[draggable]')) as HTMLElement[];
    const dataTransfer = { setData: () => {}, effectAllowed: '', dropEffect: '' };

    act(() => {
      fireEvent.dragStart(rows()[0], { dataTransfer });
    });
    // Linha "C", metade de baixo (jsdom mede 0 de altura): soltar depois de C.
    fireEvent.dragOver(rows()[2], { dataTransfer, clientY: 10 });
    fireEvent.drop(rows()[2], { dataTransfer });
    expect(visibleTexts()).toEqual(['B', 'C', 'A', 'D']);
    expect((await storage.get<any[]>('items'))!.map((item) => item.id)).toEqual(['b', 'c', 'a', 'd']);

    // Pendente não pode ir para o meio das concluídas.
    fireEvent.dragStart(rows()[0], { dataTransfer });
    fireEvent.dragOver(rows()[3], { dataTransfer, clientY: 10 });
    fireEvent.drop(rows()[3], { dataTransfer });
    expect(visibleTexts()).toEqual(['B', 'C', 'A', 'D']);
  });
});
