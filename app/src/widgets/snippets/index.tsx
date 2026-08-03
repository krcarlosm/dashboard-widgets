import React, { useEffect, useState } from 'react';
import { WidgetDefinition, WidgetComponentProps } from '../../sdk/types';
import { Plus, Copy, Check, Trash2, Code2, Tag, Search } from 'lucide-react';

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
      content: newContent.trim(),
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

  const filteredSnippets = snippets.filter((s) => {
    const term = search.toLowerCase();
    const normalizedCategory = s.category || CATEGORY_BY_LANGUAGE[s.language] || 'Other';
    const matchesText = s.title.toLowerCase().includes(term) || s.content.toLowerCase().includes(term) || s.language.toLowerCase().includes(term) || normalizedCategory.toLowerCase().includes(term);
    const matchesFilter = filterMode === 'favorites' ? s.favorite : true;
    const matchesCategory = selectedCategory === 'all' || normalizedCategory === selectedCategory;
    return matchesText && matchesFilter && matchesCategory;
  });

  const categories = Array.from(new Set(snippets.map((s) => s.category || CATEGORY_BY_LANGUAGE[s.language] || 'Other').filter(Boolean)));

  const langColor: Record<string, string> = {
    bash: '#10b981', python: '#f59e0b', javascript: '#facc15', typescript: '#38bdf8',
    sql: '#a78bfa', json: '#fb923c', yaml: '#34d399', css: '#ec4899',
    html: '#f87171', docker: '#60a5fa', text: '#64748b', other: '#94a3b8',
  };

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        color: '#f8fafc',
        fontSize: '12px',
      }}
    >
      {/* Header bar */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '6px',
            padding: '5px 8px',
          }}
        >
          <Search size={12} color="#64748b" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar snippets..."
            style={{
              background: 'transparent',
              border: 'none',
              color: '#f8fafc',
              fontSize: '11px',
              outline: 'none',
              width: '100%',
            }}
          />
        </div>
        <button
          onClick={() => { setIsAdding(!isAdding); }}
          title="Novo snippet"
          style={{
            background: isAdding ? 'rgba(2, 132, 199, 0.2)' : '#0284c7',
            border: `1px solid ${isAdding ? 'rgba(2, 132, 199, 0.4)' : '#0284c7'}`,
            color: '#fff',
            borderRadius: '6px',
            padding: '5px 9px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '10px',
            fontWeight: 600,
            flexShrink: 0,
            transition: 'all 0.2s',
          }}
        >
          <Plus size={12} /> Novo
        </button>
      </div>

      {/* Add / Edit form */}
      {isAdding && (
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.8)',
            border: '1px solid #334155',
            borderRadius: '8px',
            padding: '10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', gap: '6px' }}>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Título do snippet..."
              style={{
                flex: 1,
                background: '#0f172a',
                border: '1px solid #334155',
                color: '#f8fafc',
                borderRadius: '4px',
                padding: '5px 8px',
                fontSize: '11px',
                outline: 'none',
              }}
            />
            <select
              value={newLanguage}
              onChange={(e) => setNewLanguage(e.target.value)}
              style={{
                background: '#0f172a',
                border: '1px solid #334155',
                color: langColor[newLanguage] || '#94a3b8',
                borderRadius: '4px',
                padding: '4px 6px',
                fontSize: '10px',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l} style={{ color: '#f8fafc' }}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: '#94a3b8' }}>
            <span>Categoria atribuída:</span>
            <span style={{ color: '#38bdf8', fontWeight: 600 }}>{CATEGORY_BY_LANGUAGE[newLanguage] || 'Other'}</span>
          </div>
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Cole seu código ou comando aqui..."
            rows={4}
            style={{
              background: '#0f172a',
              border: '1px solid #334155',
              color: '#f8fafc',
              borderRadius: '4px',
              padding: '6px 8px',
              fontSize: '11px',
              fontFamily: 'monospace',
              resize: 'none',
              outline: 'none',
              lineHeight: '1.5',
              boxSizing: 'border-box',
              width: '100%',
            }}
          />
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setIsAdding(false)}
              style={{ background: 'transparent', border: '1px solid #334155', color: '#64748b', borderRadius: '4px', padding: '4px 10px', cursor: 'pointer', fontSize: '10px' }}
            >
              Cancelar
            </button>
            <button
              onClick={addSnippet}
              style={{ background: '#0284c7', border: 'none', color: '#fff', borderRadius: '4px', padding: '4px 10px', cursor: 'pointer', fontSize: '10px', fontWeight: 600 }}
            >
              Salvar
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: '4px', background: '#0f172a', borderRadius: '6px', padding: '2px', border: '1px solid #334155' }}>
          <button onClick={() => setFilterMode('all')} style={{ background: filterMode === 'all' ? '#0284c7' : 'transparent', color: filterMode === 'all' ? '#fff' : '#94a3b8', border: 'none', borderRadius: '4px', padding: '3px 8px', cursor: 'pointer', fontSize: '10px' }}>Todos</button>
          <button onClick={() => setFilterMode('favorites')} style={{ background: filterMode === 'favorites' ? '#0284c7' : 'transparent', color: filterMode === 'favorites' ? '#fff' : '#94a3b8', border: 'none', borderRadius: '4px', padding: '3px 8px', cursor: 'pointer', fontSize: '10px' }}>Favoritos</button>
          <button onClick={() => setFilterMode('categories')} style={{ background: filterMode === 'categories' ? '#0284c7' : 'transparent', color: filterMode === 'categories' ? '#fff' : '#94a3b8', border: 'none', borderRadius: '4px', padding: '3px 8px', cursor: 'pointer', fontSize: '10px' }}>Categorias</button>
        </div>
        {filterMode === 'categories' && (
          <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} style={{ background: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '4px', padding: '3px 6px', fontSize: '10px', outline: 'none' }}>
            <option value="all">Todas</option>
            {categories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        )}
      </div>

      {/* Snippets list */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {filteredSnippets.length === 0 ? (
          <div style={{ color: '#475569', textAlign: 'center', marginTop: '20px', fontSize: '12px' }}>
            {snippets.length === 0 ? (
              <>
                <Code2 size={24} style={{ margin: '0 auto 8px', display: 'block', color: '#334155' }} />
                <div>Nenhum snippet ainda.</div>
                <div style={{ fontSize: '11px', color: '#334155', marginTop: '4px' }}>Clique em "+ Novo" para criar.</div>
              </>
            ) : (
              'Nenhum snippet encontrado.'
            )}
          </div>
        ) : (
          filteredSnippets.map((snippet) => (
            <div
              key={snippet.id}
              style={{
                background: 'rgba(30, 41, 59, 0.6)',
                border: '1px solid rgba(51, 65, 85, 0.5)',
                borderRadius: '8px',
                overflow: 'hidden',
              }}
            >
              {/* Snippet header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 10px',
                  borderBottom: '1px solid rgba(51, 65, 85, 0.3)',
                  background: 'rgba(15, 23, 42, 0.4)',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0 }}>
                  <Tag size={11} color={langColor[snippet.language] || '#64748b'} style={{ flexShrink: 0 }} />
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      color: '#f1f5f9',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {snippet.title}
                  </span>
                  <span
                    style={{
                      fontSize: '9px',
                      color: langColor[snippet.language] || '#64748b',
                      background: `${langColor[snippet.language] || '#64748b'}20`,
                      border: `1px solid ${langColor[snippet.language] || '#64748b'}40`,
                      padding: '0 5px',
                      borderRadius: '4px',
                      flexShrink: 0,
                    }}
                  >
                    {snippet.language}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                  <button
                    onClick={() => toggleFavorite(snippet.id)}
                    title={snippet.favorite ? 'Remover favorito' : 'Marcar como favorito'}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: snippet.favorite ? '#f59e0b' : '#64748b',
                      cursor: 'pointer',
                      padding: '2px',
                      borderRadius: '3px',
                      display: 'flex',
                    }}
                  >
                    {snippet.favorite ? '★' : '☆'}
                  </button>
                  <button
                    onClick={() => copySnippet(snippet.id, snippet.content)}
                    title="Copiar código"
                    style={{
                      background: copiedId === snippet.id ? 'rgba(74, 222, 128, 0.15)' : 'transparent',
                      border: 'none',
                      color: copiedId === snippet.id ? '#4ade80' : '#64748b',
                      cursor: 'pointer',
                      padding: '2px',
                      borderRadius: '3px',
                      display: 'flex',
                      transition: 'all 0.2s',
                    }}
                  >
                    {copiedId === snippet.id ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                  <button
                    onClick={() => deleteSnippet(snippet.id)}
                    title="Excluir snippet"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#64748b',
                      cursor: 'pointer',
                      padding: '2px',
                      borderRadius: '3px',
                      display: 'flex',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              {/* Snippet code body */}
              <pre
                style={{
                  margin: 0,
                  padding: '8px 10px',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  color: '#e2e8f0',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  lineHeight: '1.5',
                  maxHeight: '80px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  cursor: 'pointer',
                  background: 'transparent',
                }}
                onClick={() => copySnippet(snippet.id, snippet.content)}
                title="Clique para copiar"
              >
                {snippet.content}
              </pre>
            </div>
          ))
        )}
      </div>

      {/* Footer count */}
      <div style={{ flexShrink: 0, fontSize: '10px', color: '#475569', textAlign: 'right' }}>
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
    defaultSize: { w: 5, h: 5 },
    minSize: { w: 4, h: 4 },
    maxSize: { w: 8, h: 10 },
    requiresAgent: false,
  },
  component: SnippetsWidget,
};
