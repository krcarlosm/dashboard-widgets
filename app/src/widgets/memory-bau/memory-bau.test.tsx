import { describe, expect, it } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { memoryBauWidget } from './index';
import { FakeAgentClient, renderWidget } from '../../test/harness';

const now = Date.now();
const textItem = (id: string, preview: string, chars = preview.length) => ({
  id, kind: 'text', source: 'clipboard', timestamp: now - 60_000, size: chars, preview, chars,
});
const imageItem = (id: string) => ({ id, kind: 'image', source: 'screenshot', timestamp: now - 3_600_000, size: 100 });

function bauAgent(items: any[] = [textItem('clipboard_1.txt', 'primeiro texto'), textItem('clipboard_2.txt', 'segundo')]) {
  const state = { items: [...items], retentionHours: 72 };
  const agent = new FakeAgentClient(true);
  agent
    .route('GET', '/bau/items', ({ path }) => {
      const params = new URLSearchParams(path.split('?')[1]);
      const kind = params.get('kind');
      const q = params.get('q')?.toLowerCase();
      const list = state.items.filter((item) => (!kind || item.kind === kind) && (!q || item.preview?.toLowerCase().includes(q)));
      return {
        items: list.slice(0, Number(params.get('limit') ?? 50)),
        counts: { text: state.items.filter((i) => i.kind === 'text').length, image: state.items.filter((i) => i.kind === 'image').length },
        retentionHours: state.retentionHours,
        retentionOptions: [24, 48, 72],
      };
    })
    .route('POST', /\/copy$/, { copied: true })
    .route('DELETE', /^\/bau\/items\/[^?]+$/, ({ path }) => {
      state.items = state.items.filter((item) => `/bau/items/${item.id}` !== path);
      return { deleted: true };
    })
    .route('DELETE', '/bau/items', () => {
      state.items = [];
      return { removed: [] };
    })
    .route('PUT', '/bau/settings', ({ body }) => {
      state.retentionHours = JSON.parse(body as string).retentionHours;
      return { retentionHours: state.retentionHours, retentionOptions: [24, 48, 72] };
    })
    .route('GET', /\/content$/, { text: 'texto completo '.repeat(30) });
  return { agent, state };
}

describe('Baú de Lembranças', () => {
  it('sem agente mostra aviso', () => {
    renderWidget(memoryBauWidget);
    expect(screen.getByText(/O Agent não está disponível/)).toBeInTheDocument();
  });

  it('lista textos com prévia e contagens; clique copia de volta', async () => {
    const user = userEvent.setup();
    const { agent } = bauAgent();
    renderWidget(memoryBauWidget, { agent });
    expect(await screen.findByText('primeiro texto')).toBeInTheDocument();
    expect(screen.getByTitle('Texto')).toHaveTextContent('2');

    await user.click(screen.getByText('primeiro texto'));
    expect(agent.requests).toContainEqual({ path: '/bau/items/clipboard_1.txt/copy', method: 'POST', body: undefined });
    expect(await screen.findByText('Copiado!')).toBeInTheDocument();
  });

  it('busca no agente com atraso (debounce)', async () => {
    const user = userEvent.setup();
    const { agent } = bauAgent();
    renderWidget(memoryBauWidget, { agent });
    await screen.findByText('primeiro texto');
    await user.type(screen.getByPlaceholderText('Buscar nos textos copiados...'), 'segu');
    await waitFor(() => expect(screen.queryByText('primeiro texto')).not.toBeInTheDocument());
    expect(screen.getByText('segundo')).toBeInTheDocument();
    expect(agent.requests.filter((r) => r.path.includes('q='))).toHaveLength(1);
  });

  it('"Ver tudo" busca o texto completo e excluir não copia', async () => {
    const user = userEvent.setup();
    const { agent } = bauAgent([textItem('clipboard_9.txt', 'começo...', 450)]);
    renderWidget(memoryBauWidget, { agent });
    await user.click(await screen.findByRole('button', { name: /Ver tudo/ }));
    expect(await screen.findByText(/texto completo texto completo/)).toBeInTheDocument();
    expect(agent.requests.some((r) => r.path.endsWith('/copy'))).toBe(false);

    await user.click(screen.getByTitle('Excluir do Baú'));
    await waitFor(() => expect(screen.queryByText(/texto completo/)).not.toBeInTheDocument());
    expect(agent.requests.some((r) => r.path.endsWith('/copy'))).toBe(false);
  });

  it('aba de imagens carrega miniaturas pelo agente', async () => {
    const user = userEvent.setup();
    const { agent } = bauAgent([imageItem('screenshot_1.png')]);
    renderWidget(memoryBauWidget, { agent });
    await user.click(await screen.findByTitle('Imagens'));
    await waitFor(() => expect(agent.requests.some((r) => r.path === '/bau/items/screenshot_1.png/thumbnail')).toBe(true));
    expect(screen.getByText(/Captura ·/)).toBeInTheDocument();
  });

  it('capturar tela envia o comando ao agente', async () => {
    const user = userEvent.setup();
    const { agent } = bauAgent();
    renderWidget(memoryBauWidget, { agent });
    await user.click(await screen.findByTitle('Capturar a tela inteira'));
    expect(agent.sent).toContainEqual({ type: 'screenshot:request', payload: {} });
    expect(screen.getByTitle('Capturar a tela inteira')).toBeDisabled();
    act(() => agent.emit('screenshot:result', imageItem('screenshot_2.png')));
    await waitFor(() => expect(screen.getByTitle('Capturar a tela inteira')).not.toBeDisabled());
  });

  it('item novo copiado aparece sozinho (evento do agente)', async () => {
    const { agent, state } = bauAgent([]);
    renderWidget(memoryBauWidget, { agent });
    await waitFor(() => expect(agent.requests).toHaveLength(1));
    state.items.push(textItem('clipboard_3.txt', 'acabei de copiar'));
    act(() => agent.emit('bau:item-added', state.items[0]));
    expect(await screen.findByText('acabei de copiar')).toBeInTheDocument();
  });

  it('configurações: retenção, quantidade exibida e limpar com confirmação', async () => {
    const user = userEvent.setup();
    const { agent, state } = bauAgent();
    const view = renderWidget(memoryBauWidget, { agent });
    await screen.findByText('primeiro texto');
    await user.click(screen.getByTitle('Configurações do Baú'));
    const [retention, topN] = screen.getAllByRole('combobox');
    await user.selectOptions(retention, '24');
    expect(state.retentionHours).toBe(24);
    await user.selectOptions(topN, '10');
    expect(view.updateConfig).toHaveBeenCalledWith({ topN: 10 });

    await user.click(screen.getByRole('button', { name: /Limpar Baú/ }));
    expect(state.items).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: /Confirmar limpeza/ }));
    await waitFor(() => expect(state.items).toHaveLength(0));
  });

  it('erro do agente aparece e pode ser fechado', async () => {
    const user = userEvent.setup();
    const { agent } = bauAgent();
    agent.route('POST', /\/copy$/, () => { throw new Error('Área de transferência ocupada'); });
    renderWidget(memoryBauWidget, { agent });
    await user.click(await screen.findByText('primeiro texto'));
    const banner = await screen.findByRole('alert');
    expect(within(banner).getByText('Área de transferência ocupada')).toBeInTheDocument();
    await user.click(within(banner).getByRole('button', { name: 'Fechar aviso' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
