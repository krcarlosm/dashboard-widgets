import { describe, expect, it } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { editedFilesWidget } from './index';
import { FakeAgentClient, renderWidget } from '../../test/harness';

const now = Date.now();
const file = (name: string, opened: number, edited: number, minutesAgo = 5) => ({
  path: `C:\\Docs\\${name}`,
  name,
  folder: 'C:\\Docs',
  opened,
  edited,
  total: opened + edited,
  lastOpened: opened ? now - minutesAgo * 60_000 : null,
  lastEdited: edited ? now - minutesAgo * 60_000 : null,
  lastAccess: now - minutesAgo * 60_000,
});

function filesAgent(items = [file('Relatório.xlsx', 2, 3), file('Manual.pdf', 1, 0, 60 * 26)]) {
  const state = { items, folders: [] as string[] };
  const agent = new FakeAgentClient(true);
  agent
    .route('GET', '/files/top', ({ path }) => {
      const kind = new URLSearchParams(path.split('?')[1]).get('kind');
      const list = state.items.filter((item) => !kind || (kind === 'opened' ? item.opened : item.edited));
      return { items: list, windowDays: 7, folders: state.folders };
    })
    .route('POST', '/files/scan', { added: 0 })
    .route('POST', '/files/open', { opened: true, revealed: false })
    .route('POST', '/files/reveal', { revealed: true })
    .route('PUT', '/files/folders', ({ body }) => {
      const folders = JSON.parse(body as string).folders as string[];
      if (folders.some((folder) => folder.includes('inexistente'))) throw new Error('Pasta não encontrada: C:\\inexistente');
      state.folders = folders;
      return { folders };
    });
  return { agent, state };
}

const row = (name: string) => screen.getByRole('link', { name }).closest('div')!.parentElement!.parentElement as HTMLElement;

describe('Top 10 Arquivos da Semana', () => {
  it('sem agente mostra aviso', () => {
    renderWidget(editedFilesWidget);
    expect(screen.getByText(/Inicie o serviço local para ver os arquivos da semana/)).toBeInTheDocument();
  });

  it('lista com etiquetas Aberto/Editado, ranking e tempo relativo', async () => {
    const { agent } = filesAgent();
    renderWidget(editedFilesWidget, { agent });
    expect(await screen.findByRole('link', { name: 'Relatório.xlsx' })).toBeInTheDocument();
    const first = row('Relatório.xlsx');
    expect(within(first).getByText('Aberto')).toBeInTheDocument();
    expect(within(first).getByText('Editado')).toBeInTheDocument();
    expect(within(first).getByText('1')).toBeInTheDocument();
    expect(within(first).getByText(/há 5 min · 5× · C:\\Docs/)).toBeInTheDocument();

    const second = row('Manual.pdf');
    expect(within(second).queryByText('Editado')).not.toBeInTheDocument();
    expect(within(second).getByText(/ontem/)).toBeInTheDocument();
  });

  it('em largura estreita as etiquetas viram A/E', async () => {
    const { agent } = filesAgent();
    renderWidget(editedFilesWidget, { agent, width: 300 });
    const first = await screen.findByRole('link', { name: 'Relatório.xlsx' });
    expect(within(first.parentElement!).getByText('A')).toBeInTheDocument();
    expect(within(first.parentElement!).getByText('E')).toBeInTheDocument();
  });

  it('clicar abre pelo agente; ícone mostra na pasta', async () => {
    const user = userEvent.setup();
    const { agent } = filesAgent();
    renderWidget(editedFilesWidget, { agent });
    await user.click(await screen.findByRole('link', { name: 'Relatório.xlsx' }));
    expect(agent.requests).toContainEqual({ path: '/files/open', method: 'POST', body: { path: 'C:\\Docs\\Relatório.xlsx' } });
    await user.click(within(row('Manual.pdf')).getByTitle('Mostrar na pasta'));
    expect(agent.requests).toContainEqual({ path: '/files/reveal', method: 'POST', body: { path: 'C:\\Docs\\Manual.pdf' } });
  });

  it('filtro fica salvo na configuração e consulta o agente por tipo', async () => {
    const user = userEvent.setup();
    const { agent } = filesAgent();
    const view = renderWidget(editedFilesWidget, { agent });
    await screen.findByRole('link', { name: 'Manual.pdf' });
    await user.click(screen.getByRole('button', { name: 'Editados' }));
    expect(view.getConfig()).toEqual({ filter: 'edited' });
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Manual.pdf' })).not.toBeInTheDocument());
    expect(agent.requests[agent.requests.length - 1].path).toBe('/files/top?limit=10&kind=edited');
  });

  it('lista vazia explica o período', async () => {
    const { agent } = filesAgent([]);
    renderWidget(editedFilesWidget, { agent, config: { filter: 'opened' } });
    expect(await screen.findByText('Nenhum arquivo aberto nos últimos 7 dias.')).toBeInTheDocument();
  });

  it('atualiza sozinho quando o agente avisa', async () => {
    const { agent, state } = filesAgent([]);
    renderWidget(editedFilesWidget, { agent });
    await screen.findByText(/Nenhum arquivo/);
    state.items = [file('Novo.docx', 1, 0)];
    act(() => agent.emit('files:updated', {}));
    expect(await screen.findByRole('link', { name: 'Novo.docx' }, { timeout: 2000 })).toBeInTheDocument();
  });

  it('pastas monitoradas: adiciona, mostra erro e remove', async () => {
    const user = userEvent.setup();
    const { agent, state } = filesAgent();
    renderWidget(editedFilesWidget, { agent });
    await screen.findByRole('link', { name: 'Manual.pdf' });
    await user.click(screen.getByTitle('Pastas monitoradas'));
    const input = screen.getByPlaceholderText('Cole o caminho de uma pasta');
    await user.type(input, 'C:\\inexistente{Enter}');
    expect(await screen.findByText('Pasta não encontrada: C:\\inexistente')).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, 'C:\\Projetos{Enter}');
    await waitFor(() => expect(state.folders).toEqual(['C:\\Projetos']));
    await user.click(screen.getByTitle('Parar de monitorar'));
    await waitFor(() => expect(state.folders).toEqual([]));
  });

  it('botão atualizar pede varredura imediata', async () => {
    const user = userEvent.setup();
    const { agent } = filesAgent();
    renderWidget(editedFilesWidget, { agent });
    await user.click(await screen.findByTitle('Atualizar agora'));
    expect(agent.requests.some((r) => r.path === '/files/scan')).toBe(true);
  });

  it('remove o histórico antigo do localStorage', () => {
    localStorage.setItem('widget:teste-1:edited-files', '[]');
    renderWidget(editedFilesWidget);
    expect(localStorage.getItem('widget:teste-1:edited-files')).toBeNull();
  });
});
