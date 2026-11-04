import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentOfflineBanner, Badge, Banner, ConfirmButton, EmptyState, FieldLabel, IconButton, Input, SegmentedControl } from './index';
import { confirmDialog } from './ConfirmDialog';
import { buildAppearanceStyle, DENSITY, widgetAccentStyle } from '../theme/tokens';

describe('Componentes compartilhados', () => {
  it('IconButton exige rótulo acessível (tooltip e leitor de tela)', () => {
    render(<IconButton label="Atualizar agora" icon={<span>↻</span>} />);
    const button = screen.getByRole('button', { name: 'Atualizar agora' });
    expect(button).toHaveAttribute('title', 'Atualizar agora');
  });

  it('SegmentedControl marca a opção ativa e encurta no modo compacto', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const options = [{ id: 'all', label: 'Todos' }, { id: 'edited', label: 'Editados', count: 3 }] as const;
    const { rerender } = render(<SegmentedControl options={[...options]} value="all" onChange={onChange} ariaLabel="Filtro" />);
    expect(screen.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Editados' }));
    expect(onChange).toHaveBeenCalledWith('edited');

    rerender(<SegmentedControl options={[...options]} value="all" onChange={onChange} compact />);
    expect(screen.getByRole('button', { name: 'Editados' })).toHaveTextContent('Edi3');
  });

  it('ConfirmButton só executa no segundo clique e desarma sozinho', () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn();
    render(<ConfirmButton label="Excluir" icon={<span>x</span>} iconOnly onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(onConfirm).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(4100));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar? (Excluir)' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('FieldLabel associa o rótulo ao campo', () => {
    render(
      <>
        <FieldLabel htmlFor="campo">Data inicial</FieldLabel>
        <Input id="campo" />
      </>,
    );
    expect(screen.getByLabelText('Data inicial')).toBeInTheDocument();
  });

  it('Banner fecha; aviso do agente e estado vazio têm texto padrão', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <>
        <Banner onClose={onClose}>Falhou</Banner>
        <AgentOfflineBanner what="ver o Baú" />
        <EmptyState title="Nada aqui" hint="Adicione algo" />
        <Badge tone="warning">Editado</Badge>
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'Fechar aviso' }));
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByText('O Agent não está disponível. Inicie o serviço local para ver o Baú.')).toBeInTheDocument();
    expect(screen.getByText('Adicione algo')).toBeInTheDocument();
  });

  it('confirmDialog resolve com a escolha e some da tela', async () => {
    const user = userEvent.setup();
    let result: Promise<boolean>;
    act(() => {
      result = confirmDialog({ title: 'Apagar tudo?', message: 'Não dá para desfazer.', confirmLabel: 'Apagar' });
    });
    expect(await screen.findByRole('alertdialog', { name: 'Apagar tudo?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Apagar' }));
    await expect(result!).resolves.toBe(true);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());

    act(() => {
      result = confirmDialog({ title: 'Outra?', message: '' });
    });
    await screen.findByRole('alertdialog');
    await user.keyboard('{Escape}');
    await expect(result!).resolves.toBe(false);
  });
});

describe('Tokens', () => {
  it('tema claro usa cores semânticas mais escuras que o escuro', () => {
    const dark = buildAppearanceStyle({ theme: 'dark', density: 'comfortable', accentColor: 'sky' }) as Record<string, string>;
    const light = buildAppearanceStyle({ theme: 'light', density: 'compact', accentColor: 'violet' }) as Record<string, string>;
    expect(dark['--app-warning']).toBe('#fbbf24');
    expect(light['--app-warning']).toBe('#b45309');
    expect(light['--app-accent']).toBe('#8b5cf6');
    expect(light['--density-zoom']).toBe('0.85');
  });

  it('densidade compacta cabe na grade (conteúdo reduzido ≤ espaço disponível)', () => {
    const height = (rows: number, d: (typeof DENSITY)[keyof typeof DENSITY]) => rows * d.rowHeight + (rows - 1) * d.margin;
    for (const rows of [2, 3, 4, 5, 8, 12]) {
      expect(height(rows, DENSITY.comfortable) * DENSITY.compact.zoom).toBeLessThanOrEqual(height(rows, DENSITY.compact) + 0.5);
    }
  });

  it('cor da instância vira --widget-accent; sem cor, segue o app', () => {
    expect(widgetAccentStyle()).toMatchObject({ '--widget-accent': 'var(--app-accent)' });
    expect(widgetAccentStyle('#fb7185')).toMatchObject({ '--widget-accent': '#fb7185' });
  });
});
