import React, { useEffect, useState } from 'react';
import { WidgetDefinition, WidgetComponentProps } from '../../sdk/types';
import { Plus, Copy, Check, Trash2, Code2, Tag, Search, ChevronDown, ChevronRight } from 'lucide-react';
import { Button, ConfirmButton, EmptyState, IconButton, Input, ListItem, SegmentedControl, Select, TextArea, Toolbar } from '../../ui';

interface Snippet {
  id: string;
  title: string;
  content: string;
  language: string;
  category: string;
  favorite: boolean;
  createdAt: number;
}

const LANGUAGES = ['text', 'bash', 'python', 'javascript', 'typescript', 'sql', 'json', 'yaml', 'css', 'html', 'docker', 'other'];
const CATEGORY_BY_LANGUAGE: Record<string, string> = {
  text: 'Text',
  bash: 'Bash',
  python: 'Python',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  sql: 'SQL',
  json: 'JSON',
  yaml: 'YAML',
  css: 'CSS',
  html: 'HTML',
  docker: 'Docker',
  other: 'Other',
};

const SnippetsWidget: React.FC<WidgetComponentProps> = ({ context }) => {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [search, setSearch] = useState<string>('');
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showAllContents, setShowAllContents] = useState<boolean>(false);
  const [expandedSnippetIds, setExpandedSnippetIds] = useState<Record<string, boolean>>({});
  const [filterMode, setFilterMode] = useState<'all' | 'favorites' | 'categories'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const [newTitle, setNewTitle] = useState<string>('');
  const [newContent, setNewContent] = useState<string>('');
  const [newLanguage, setNewLanguage] = useState<string>('text');

  useEffect(() => {
    async function load() {
      const saved = await context.storage.get<Snippet[]>('snippets', []);
      setSnippets(saved || []);
    }
    load();
  }, [context.storage]);

  const saveSnippets = async (list: Snippet[]) => {
    setSnippets(list);
    await context.storage.set('snippets', list);
  };

  const addSnippet = async () => {
    if (!newContent.trim()) return;
    const snippet: Snippet = {
      id: `snip-${Date.now()}`,
      title: newTitle.trim() || 'Sem título',
      // Remove só linhas em branco do início e espaços do fim: a indentação do código fica.
      content: newContent.replace(/^([ \t]*\r?\n)+/, '').trimEnd(),
      language: newLanguage,
      category: CATEGORY_BY_LANGUAGE[newLanguage] || 'Other',
      favorite: false,
      createdAt: Date.now(),
    };
    await saveSnippets([snippet, ...snippets]);
    setNewTitle('');
    setNewContent('');
    setNewLanguage('text');
    setIsAdding(false);
  };

  const deleteSnippet = async (id: string) => {
    await saveSnippets(snippets.filter((s) => s.id !== id));
  };

  const copySnippet = async (id: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch { /* ignore */ }
  };

  const toggleFavorite = async (id: string) => {
    const updated = snippets.map((s) => (s.id === id ? { ...s, favorite: !s.favorite } : s));
    await saveSnippets(updated);
  };

  const toggleSnippetExpansion = (id: string) => {
    setExpandedSnippetIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredSnippets = snippets.filter((s) => {
    const term = search.toLowerCase();
    const normalizedCategory = s.category || CATEGORY_BY_LANGUAGE[s.language] || 'Other';
    const matchesText = s.title.toLowerCase().includes(term) || s.content.toLowerCase().includes(term) || s.language.toLowerCase().includes(term) || normalizedCategory.toLowerCase().includes(term);
    const matchesFilter = filterMode === 'favorites' ? s.favorite : true;
    // A categoria só filtra enquanto o seletor de categorias está visível.
    const matchesCategory = filterMode !== 'categories' || selectedCategory === 'all' || normalizedCategory === selectedCategory;
    return matchesText && matchesFilter && matchesCategory;
  });

  const categories = Array.from(new Set(snippets.map((s) => s.category || CATEGORY_BY_LANGUAGE[s.language] || 'Other').filter(Boolean)));

  const langColor: Record<string, string> = {
    bash: '#10b981', python: '#f59e0b', javascript: '#facc15', typescript: '#38bdf8',
    sql: '#a78bfa', json: '#fb923c', yaml: '#34d399', css: '#ec4899',
    html: '#f87171', docker: '#60a5fa', text: '#64748b', other: '#94a3b8',
  };

  const isCompact = context.dimensions.width > 0 && context.dimensions.width < 330;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '8px', color: 'var(--app-text)', fontSize: 'var(--font-md)' }}>
      {/* Busca e novo */}
      <Toolbar>
        <div style={{ flex: 1, minWidth: 0, position: 'relative', display: 'flex' }}>
          <Search size={12} color="var(--app-muted)" style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)' }} />
          <Input
            type="text"
            aria-label="Buscar snippets"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar snippets..."
            style={{ flex: 1, paddingLeft: '26px', fontSize: 'var(--font-sm)' }}
          />
        </div>
        <Button variant="primary" onClick={() => setIsAdding(!isAdding)} title="Novo snippet" icon={<Plus size={12} />}>
          Novo
        </Button>
      </Toolbar>

      {/* Formulário de novo snippet */}
      {isAdding && (
        <div style={{ background: 'var(--app-surface-muted)', border: '1px solid var(--widget-accent-border)', borderRadius: 'var(--radius-lg)', padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            <Input value={newTitle} aria-label="Título do snippet" onChange={(e) => setNewTitle(e.target.value)} placeholder="Título do snippet..." style={{ flex: 1, fontSize: 'var(--font-sm)' }} />
            <Select value={newLanguage} aria-label="Linguagem" onChange={(e) => setNewLanguage(e.target.value)} style={{ fontSize: 'var(--font-sm)' }}>
              {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
            </Select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--font-xs)', color: 'var(--app-muted)' }}>
            <span>Categoria atribuída:</span>
            <span style={{ color: 'var(--widget-accent)', fontWeight: 600 }}>{CATEGORY_BY_LANGUAGE[newLanguage] || 'Other'}</span>
          </div>
          <TextArea
            value={newContent}
            aria-label="Conteúdo do snippet"
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Cole seu código ou comando aqui..."
            rows={4}
            style={{ fontFamily: 'monospace', fontSize: 'var(--font-sm)', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
            <Button onClick={() => setIsAdding(false)}>Cancelar</Button>
            <Button variant="primary" onClick={addSnippet}>Salvar</Button>
          </div>
        </div>
      )}

      {/* Filtros */}
      <Toolbar style={{ flexWrap: 'wrap' }}>
        <SegmentedControl
          ariaLabel="Filtro"
          compact={isCompact}
          value={filterMode}
          onChange={setFilterMode}
          options={[
            { id: 'all', label: 'Todos' },
            { id: 'favorites', label: 'Favoritos' },
            { id: 'categories', label: 'Categorias' },
          ]}
        />
        {filterMode === 'categories' && (
          <Select value={selectedCategory} aria-label="Categoria" onChange={(e) => setSelectedCategory(e.target.value)} style={{ fontSize: 'var(--font-xs)' }}>
            <option value="all">Todas</option>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </Select>
        )}
        <Button variant={showAllContents ? 'primary' : 'secondary'} aria-pressed={showAllContents} onClick={() => setShowAllContents((prev) => !prev)} style={{ fontSize: 'var(--font-xs)' }}>
          {showAllContents ? 'Mostrar títulos' : 'Mostrar conteúdos'}
        </Button>
      </Toolbar>

      {/* Lista */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {filteredSnippets.length === 0 ? (
          snippets.length === 0
            ? <EmptyState icon={<Code2 size={24} />} title="Nenhum snippet ainda." hint='Clique em "+ Novo" para criar.' />
            : <EmptyState title="Nenhum snippet encontrado." />
        ) : (
          filteredSnippets.map((snippet) => {
            const isExpanded = showAllContents || expandedSnippetIds[snippet.id];
            const color = langColor[snippet.language] || 'var(--app-muted)';
            return (
              <ListItem key={snippet.id} style={{ padding: 0, overflow: 'hidden' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '4px 6px',
                    borderBottom: isExpanded ? '1px solid var(--app-border)' : 'none',
                    gap: '6px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0 }}>
                    <IconButton
                      label={isExpanded ? 'Ocultar conteúdo' : 'Mostrar conteúdo'}
                      icon={isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      onClick={() => toggleSnippetExpansion(snippet.id)}
                      style={{ padding: '2px' }}
                    />
                    <Tag size={11} color={color} style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: 'var(--font-sm)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {snippet.title}
                    </span>
                    <span style={{ fontSize: '9px', color, border: `1px solid ${color}`, padding: '0 5px', borderRadius: 'var(--radius-sm)', flexShrink: 0 }}>
                      {snippet.language}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
                    <IconButton
                      label={snippet.favorite ? 'Remover favorito' : 'Marcar como favorito'}
                      icon={<span style={{ fontSize: '13px', lineHeight: 1 }}>{snippet.favorite ? '★' : '☆'}</span>}
                      onClick={() => toggleFavorite(snippet.id)}
                      style={{ color: snippet.favorite ? 'var(--app-warning)' : 'var(--app-muted)', padding: '2px 4px' }}
                    />
                    <IconButton
                      label="Copiar código"
                      icon={copiedId === snippet.id ? <Check size={12} /> : <Copy size={12} />}
                      tone={copiedId === snippet.id ? 'success' : undefined}
                      onClick={() => copySnippet(snippet.id, snippet.content)}
                      style={{ padding: '2px 4px' }}
                    />
                    <ConfirmButton label="Excluir snippet" confirmLabel="Excluir?" icon={<Trash2 size={12} />} iconOnly onConfirm={() => deleteSnippet(snippet.id)} />
                  </div>
                </div>

                {isExpanded && (
                  <pre
                    onClick={() => copySnippet(snippet.id, snippet.content)}
                    title="Clique para copiar"
                    style={{
                      margin: 0,
                      padding: '8px 10px',
                      fontSize: 'var(--font-sm)',
                      fontFamily: 'monospace',
                      color: 'var(--app-text)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      lineHeight: 1.5,
                      maxHeight: '120px',
                      overflow: 'auto',
                      cursor: 'copy',
                      userSelect: 'text',
                    }}
                  >
                    {snippet.content}
                  </pre>
                )}
              </ListItem>
            );
          })
        )}
      </div>

      <div style={{ flexShrink: 0, fontSize: 'var(--font-xs)', color: 'var(--app-muted)', textAlign: 'right' }}>
        {filteredSnippets.length} de {snippets.length} snippet(s)
      </div>
    </div>
  );
};

export const snippetsWidget: WidgetDefinition = {
  manifest: {
    id: 'snippets',
    name: 'Gerenciador de Snippets',
    version: '1.0.0',
    description: 'Salve e acesse rapidamente trechos de código ou comandos com 1-clique para copiar.',
    icon: 'Code2',
    author: 'Dashboard Core',
    status: 'stable',
    defaultSize: { w: 4, h: 4 },
    minSize: { w: 3, h: 4 },
    maxSize: { w: 8, h: 10 },
    requiresAgent: false,
  },
  component: SnippetsWidget,
};
