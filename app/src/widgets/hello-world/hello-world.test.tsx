import { describe, expect, it } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { helloWorldWidget } from './index';
import { FakeAgentClient, renderWidget } from '../../test/harness';

describe('Hello World SDK', () => {
  it('persiste contador e nota no storage do widget', async () => {
    const user = userEvent.setup();
    const view = renderWidget(helloWorldWidget);
    await user.click(await screen.findByRole('button', { name: 'Contador: 0' }));
    await user.click(screen.getByRole('button', { name: 'Contador: 1' }));
    await user.type(screen.getByPlaceholderText('Digite algo para salvar...'), 'olá');

    view.reload();
    expect(await screen.findByRole('button', { name: 'Contador: 2' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Digite algo para salvar...')).toHaveValue('olá');
  });

  it('mostra as dimensões recebidas no contexto', () => {
    renderWidget(helloWorldWidget, { width: 320, height: 200 });
    expect(screen.getByText('320px × 200px')).toBeInTheDocument();
  });

  it('acompanha o agente ficando online e offline', async () => {
    const agent = new FakeAgentClient(false);
    renderWidget(helloWorldWidget, { agent });
    expect(screen.getByText('Agent Offline')).toBeInTheDocument();
    act(() => agent.setConnected(true));
    expect(await screen.findByText('Agent Ativo')).toBeInTheDocument();
    act(() => agent.setConnected(false));
    await waitFor(() => expect(screen.getByText('Agent Offline')).toBeInTheDocument());
  });
});
