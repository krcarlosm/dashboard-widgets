import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { notesWidget } from './index';
import { escapeHtml, htmlToMarkdown, markdownToHtml, migrateLegacyContent } from './markdown';
import { MemoryStorage, renderWidget } from '../../test/harness';

const LEGACY_PLACEHOLDER = 'Escreva em modo visual rico (cole imagens, negrito, etc)...';

describe('Anotações — conversão Markdown', () => {
  it('Markdown → HTML sanitizado (sem scripts nem handlers)', () => {
    const html = markdownToHtml('# Título\n\n**negrito**\n\n<img src=x onerror="alert(1)"><script>alert(2)</script>');
    expect(html).toContain('<h1>Título</h1>');
    expect(html).toContain('<strong>negrito</strong>');
    expect(html).not.toMatch(/onerror|<script/);
  });

  it('HTML → Markdown preserva listas, links e tabelas', () => {
    expect(htmlToMarkdown('<ul><li>um</li><li>dois</li></ul>')).toBe('-   um\n-   dois');
    expect(htmlToMarkdown('<a href="https://ex.com">link</a> <em>it</em>')).toBe('[link](https://ex.com) *it*');
    expect(htmlToMarkdown('<table><tr><th>A</th></tr><tr><td>1</td></tr></table>')).toContain('| A |');
  });

  it('ida e volta mantém o texto', () => {
    const markdown = '## Reunião\n\n-   item **importante**\n-   outro';
    expect(htmlToMarkdown(markdownToHtml(markdown))).toBe(markdown);
  });

  it('escapa HTML de texto colado', () => {
    expect(escapeHtml('<b>"x" & y</b>')).toBe('&lt;b&gt;&quot;x&quot; &amp; y&lt;/b&gt;');
  });

  it('migra notas antigas: remove o placeholder e converte HTML', () => {
    expect(migrateLegacyContent(`${LEGACY_PLACEHOLDER}<em></em>`)).toEqual({ content: '', changed: true });
    expect(migrateLegacyContent('<p>Olá <strong>mundo</strong></p>')).toEqual({ content: 'Olá **mundo**', changed: true });
    expect(migrateLegacyContent('texto puro')).toEqual({ content: 'texto puro', changed: false });
  });
});

describe('Anotações — widget', () => {
  const textarea = () => screen.getByPlaceholderText('Escreva suas anotações aqui...');

  it('salva automaticamente e restaura após recarregar', async () => {
    const user = userEvent.setup();
    const view = renderWidget(notesWidget);
    await user.type(await screen.findByPlaceholderText('Escreva suas anotações aqui...'), 'Lembrar do backup');
    await waitFor(() => expect(view.storage.data.get('content')).toBe('Lembrar do backup'), { timeout: 2000 });
    expect(screen.getByText(/Salvo às/)).toBeInTheDocument();
    expect(screen.getByText('17 caracteres')).toBeInTheDocument();

    view.reload();
    await waitFor(() => expect(textarea()).toHaveValue('Lembrar do backup'));
  });

  it('desmontar com gravação pendente não perde texto', async () => {
    const view = renderWidget(notesWidget);
    fireEvent.change(await screen.findByPlaceholderText('Escreva suas anotações aqui...'), { target: { value: 'último' } });
    view.unmount();
    await waitFor(() => expect(view.storage.data.get('content')).toBe('último'));
  });

  it('modo Markdown renderiza o conteúdo e guarda o modo escolhido', async () => {
    const user = userEvent.setup();
    const storage = new MemoryStorage();
    await storage.set('content', '# Plano\n\n- [x] feito');
    await storage.set('contentFormat', 'markdown');
    renderWidget(notesWidget, { storage });
    await user.click(await screen.findByTitle('Markdown'));
    expect(screen.getByRole('heading', { name: 'Plano' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(storage.data.get('mode')).toBe('markdown');
  });

  it('modo Rich mostra o Markdown formatado e salva edições como Markdown', async () => {
    const user = userEvent.setup();
    const storage = new MemoryStorage();
    await storage.set('content', 'Texto **forte**');
    await storage.set('contentFormat', 'markdown');
    renderWidget(notesWidget, { storage });
    await user.click(await screen.findByTitle('Rich'));
    const editor = document.querySelector('.notes-rich') as HTMLDivElement;
    await waitFor(() => expect(editor.innerHTML).toContain('<strong>forte</strong>'));

    editor.innerHTML = '<p>Texto <strong>forte</strong> e <em>itálico</em></p>';
    fireEvent.input(editor);
    fireEvent.blur(editor);
    await waitFor(() => expect(storage.data.get('content')).toBe('Texto **forte** e *itálico*'));
    // O placeholder do Rich é só visual (CSS), nunca vira conteúdo.
    expect(storage.data.get('content')).not.toContain(LEGACY_PLACEHOLDER);
  });

  it('migra nota antiga ao abrir e guarda o original', async () => {
    const storage = new MemoryStorage();
    await storage.set('content', `<p>Antiga</p>${LEGACY_PLACEHOLDER}`);
    renderWidget(notesWidget, { storage });
    await waitFor(() => expect(textarea()).toHaveValue('Antiga'));
    expect(storage.data.get('contentLegacy')).toBe(`<p>Antiga</p>${LEGACY_PLACEHOLDER}`);
    expect(storage.data.get('contentFormat')).toBe('markdown');
  });

  it('Apagar pede confirmação (segundo clique)', async () => {
    const user = userEvent.setup();
    const storage = new MemoryStorage();
    await storage.set('content', 'algo');
    await storage.set('contentFormat', 'markdown');
    renderWidget(notesWidget, { storage });
    await waitFor(() => expect(textarea()).toHaveValue('algo'));
    await user.click(screen.getByTitle('Apagar anotação'));
    expect(textarea()).toHaveValue('algo');
    await user.click(screen.getByTitle('Clique novamente para apagar a anotação'));
    expect(textarea()).toHaveValue('');
    await waitFor(() => expect(storage.data.get('content')).toBe(''));
  });

  it('copia o conteúdo em Markdown', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    const storage = new MemoryStorage();
    await storage.set('content', '**oi**');
    await storage.set('contentFormat', 'markdown');
    renderWidget(notesWidget, { storage });
    await waitFor(() => expect(textarea()).toHaveValue('**oi**'));
    await user.click(screen.getByTitle(/Copiar/));
    expect(writeText).toHaveBeenCalledWith('**oi**');
  });

  it('em largura estreita o rodapé mostra só ícones', async () => {
    renderWidget(notesWidget, { width: 300 });
    await screen.findByPlaceholderText('Escreva suas anotações aqui...');
    expect(screen.queryByText('Texto')).not.toBeInTheDocument();
    expect(screen.getByTitle('0 caracteres')).toHaveTextContent('0');
  });
});
