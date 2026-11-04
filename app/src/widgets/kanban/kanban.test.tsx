import { describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { kanbanWidget } from './index';
import { MemoryStorage, renderWidget } from '../../test/harness';

const column = (label: string) => screen.getByText(label, { selector: 'span' }).parentElement!.parentElement!.parentElement as HTMLElement;
const cardsIn = (label: string) =>
  Array.from(column(label).querySelectorAll('[draggable]')).map((card) => card.querySelector('span')?.textContent);

async function seeded(items: { id: string; text: string; status: string }[]) {
  const storage = new MemoryStorage();
  await storage.set('kanban_items', items.map((item) => ({ ...item, createdAt: 1 })));
  return storage;
}

describe('Mini-Kanban', () => {
  it('quadro novo começa com cartões de exemplo nas três colunas', async () => {
    renderWidget(kanbanWidget);
    expect(await screen.findByText('💡 Rascunhar novas ideias')).toBeInTheDocument();
    expect(cardsIn('Em Andamento')).toEqual(['⚡ Desenvolver protótipo']);
    expect(cardsIn('Concluído')).toEqual(['✅ Finalizar documentação']);
  });

  it('adiciona no topo de "À Fazer", limita a 50 caracteres e persiste', async () => {
    const user = userEvent.setup();
    const storage = await seeded([{ id: 'a', text: 'Antigo', status: 'todo' }]);
    const view = renderWidget(kanbanWidget, { storage });
    await screen.findByText('Antigo');
    const input = screen.getByPlaceholderText('Nova tarefa (max 50 caracteres)...');
    await user.type(input, 'x'.repeat(60));
    expect(screen.getByText('50/50')).toBeInTheDocument();
    await user.keyboard('{Enter}');
    await user.type(input, 'Nova{Enter}');
    expect(cardsIn('À Fazer')).toEqual(['Nova', 'x'.repeat(50), 'Antigo']);

    view.reload();
    expect(await screen.findByText('Nova')).toBeInTheDocument();
  });

  it('botões de status movem o cartão entre colunas', async () => {
    const user = userEvent.setup();
    const storage = await seeded([{ id: 'a', text: 'Cartão', status: 'todo' }]);
    renderWidget(kanbanWidget, { storage });
    const card = (await screen.findByText('Cartão')).parentElement!;
    await user.click(within(card).getByTitle('Mudar para: Em Andamento'));
    expect(cardsIn('Em Andamento')).toEqual(['Cartão']);
    await user.click(within(screen.getByText('Cartão').parentElement!).getByTitle('Mudar para: Concluído'));
    expect(cardsIn('Concluído')).toEqual(['Cartão']);
    expect((await storage.get<any[]>('kanban_items'))![0].status).toBe('done');
  });

  it('arrastar para outra coluna muda o status', async () => {
    const storage = await seeded([{ id: 'a', text: 'Arrastável', status: 'todo' }]);
    renderWidget(kanbanWidget, { storage });
    const card = (await screen.findByText('Arrastável')).parentElement!;
    const data: Record<string, string> = {};
    const dataTransfer = { setData: (type: string, value: string) => (data[type] = value), getData: (type: string) => data[type] ?? '' };
    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.dragOver(column('Concluído'), { dataTransfer });
    fireEvent.drop(column('Concluído'), { dataTransfer });
    expect(await screen.findByText('Arrastável')).toBeInTheDocument();
    expect(cardsIn('Concluído')).toEqual(['Arrastável']);
  });

  it('soltar algo que não é cartão não altera o quadro', async () => {
    const storage = await seeded([{ id: 'a', text: 'Fixo', status: 'todo' }]);
    renderWidget(kanbanWidget, { storage });
    await screen.findByText('Fixo');
    const dataTransfer = { getData: () => 'https://link-arrastado.example' };
    fireEvent.drop(column('Concluído'), { dataTransfer });
    expect(cardsIn('À Fazer')).toEqual(['Fixo']);
  });

  it('exclui cartão', async () => {
    const user = userEvent.setup();
    const storage = await seeded([{ id: 'a', text: 'Apagar', status: 'done' }]);
    renderWidget(kanbanWidget, { storage });
    await user.click(await screen.findByRole('button', { name: 'Excluir card' }));
    expect(screen.getByText('Apagar')).toBeInTheDocument(); // primeiro clique só arma
    await user.click(screen.getByRole('button', { name: 'Excluir? (Excluir card)' }));
    expect(screen.queryByText('Apagar')).not.toBeInTheDocument();
    expect(await storage.get('kanban_items')).toEqual([]);
  });
});
