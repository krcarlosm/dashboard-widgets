import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { snippetsWidget } from './index';
import { MemoryStorage, renderWidget } from '../../test/harness';

const snippet = (id: string, title: string, language: string, extra: Record<string, any> = {}) => ({
  id,
  title,
  content: `conteudo de ${title}`,
  language,
  category: language.charAt(0).toUpperCase() + language.slice(1),
  favorite: false,
  createdAt: 1,
  ...extra,
});

const titles = () => Array.from(document.querySelectorAll('[title="Copiar código"]')).map((button) => button.closest('div')!.parentElement!.querySelector('span')?.textContent);

async function seeded(list: any[]) {
  const storage = new MemoryStorage();
  await storage.set('snippets', list);
  return storage;
}

describe('Gerenciador de Snippets', () => {
  it('cria snippet com categoria pela linguagem, mantém a indentação e persiste', async () => {
    const user = userEvent.setup();
    const view = renderWidget(snippetsWidget);
    expect(await screen.findByText('Nenhum snippet ainda.')).toBeInTheDocument();
    await user.click(screen.getByTitle('Novo snippet'));
    await user.type(screen.getByPlaceholderText('Título do snippet...'), 'Compose');
    await user.selectOptions(screen.getByRole('combobox'), 'yaml');
    expect(screen.getByText('YAML')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Cole seu código ou comando aqui...'), {
      target: { value: '\n  services:\n    web: {}\n\n' },
    });
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    const saved = (await view.storage.get<any[]>('snippets'))![0];
    expect(saved).toMatchObject({ title: 'Compose', language: 'yaml', category: 'YAML', content: '  services:\n    web: {}' });

    view.reload();
    expect(await screen.findByText('Compose')).toBeInTheDocument();
    expect(screen.getByText('1 de 1 snippet(s)')).toBeInTheDocument();
  });

  it('não salva conteúdo vazio; título vazio vira "Sem título"', async () => {
    const user = userEvent.setup();
    const view = renderWidget(snippetsWidget);
    await user.click(await screen.findByTitle('Novo snippet'));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await view.storage.get('snippets')).toBeUndefined();
    await user.type(screen.getByPlaceholderText('Cole seu código ou comando aqui...'), 'ls -la');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(screen.getByText('Sem título')).toBeInTheDocument();
  });

  it('busca por título, conteúdo e linguagem', async () => {
    const user = userEvent.setup();
    renderWidget(snippetsWidget, { storage: await seeded([snippet('1', 'Listar', 'bash'), snippet('2', 'Query', 'sql')]) });
    await screen.findByText('Listar');
    await user.type(screen.getByPlaceholderText('Buscar snippets...'), 'SQL');
    expect(titles()).toEqual(['Query']);
    await user.clear(screen.getByPlaceholderText('Buscar snippets...'));
    await user.type(screen.getByPlaceholderText('Buscar snippets...'), 'conteudo de listar');
    expect(titles()).toEqual(['Listar']);
    await user.type(screen.getByPlaceholderText('Buscar snippets...'), 'zzz');
    expect(screen.getByText('Nenhum snippet encontrado.')).toBeInTheDocument();
  });

  it('favoritos e categorias não se misturam', async () => {
    const user = userEvent.setup();
    const storage = await seeded([snippet('1', 'Py', 'python', { favorite: true }), snippet('2', 'Sh', 'bash', { favorite: true }), snippet('3', 'Js', 'javascript')]);
    renderWidget(snippetsWidget, { storage });
    await screen.findByText('Py');

    await user.click(screen.getByRole('button', { name: 'Categorias' }));
    await user.selectOptions(screen.getByRole('combobox'), 'Python');
    expect(titles()).toEqual(['Py']);
    // Antes da correção, a categoria escondida continuava filtrando os favoritos.
    await user.click(screen.getByRole('button', { name: 'Favoritos' }));
    expect(titles()).toEqual(['Py', 'Sh']);
    await user.click(screen.getByRole('button', { name: 'Todos' }));
    expect(titles()).toEqual(['Py', 'Sh', 'Js']);
  });

  it('favoritar, expandir, copiar e excluir', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    const storage = await seeded([snippet('1', 'Docker', 'docker')]);
    renderWidget(snippetsWidget, { storage });
    await user.click(await screen.findByTitle('Marcar como favorito'));
    expect((await storage.get<any[]>('snippets'))![0].favorite).toBe(true);

    await user.click(screen.getByTitle('Mostrar conteúdo'));
    await user.click(screen.getByTitle('Clique para copiar'));
    expect(writeText).toHaveBeenCalledWith('conteudo de Docker');
    await user.click(screen.getByTitle('Ocultar conteúdo'));
    expect(screen.queryByTitle('Clique para copiar')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Excluir snippet' }));
    expect(screen.getByText('Docker')).toBeInTheDocument(); // primeiro clique só arma
    await user.click(screen.getByRole('button', { name: 'Excluir? (Excluir snippet)' }));
    expect(screen.getByText('Nenhum snippet ainda.')).toBeInTheDocument();
  });

  it('"Mostrar conteúdos" expande todos', async () => {
    const user = userEvent.setup();
    renderWidget(snippetsWidget, { storage: await seeded([snippet('1', 'A', 'text'), snippet('2', 'B', 'text')]) });
    await screen.findByText('A');
    await user.click(screen.getByRole('button', { name: 'Mostrar conteúdos' }));
    expect(screen.getAllByTitle('Clique para copiar')).toHaveLength(2);
    expect(within(screen.getAllByTitle('Clique para copiar')[1]).getByText('conteudo de B')).toBeInTheDocument();
  });
});
