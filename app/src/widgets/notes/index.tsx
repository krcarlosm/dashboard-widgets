import React, { useEffect, useState, useRef } from 'react';
import { WidgetDefinition, WidgetComponentProps } from '../../sdk/types';
import { FileText, Save, Clock, Copy, Check, Type, PenTool, BookOpen } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type NotesMode = 'plain' | 'rich' | 'markdown';

const NotesWidget: React.FC<WidgetComponentProps> = ({ context }) => {
  const [content, setContent] = useState<string>('');
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [mode, setMode] = useState<NotesMode>('plain');
  const saveTimeoutRef = useRef<any>(null);

  // Load saved notes on mount
  useEffect(() => {
    async function loadNotes() {
      const savedContent = await context.storage.get<string>('content', '');
      const savedUpdatedAt = await context.storage.get<number>('updatedAt', 0);
      const savedMode = await context.storage.get<NotesMode>('mode', 'plain');
      if (savedContent !== undefined) {
        setContent(savedContent);
      }
      if (savedMode) {
        setMode(savedMode);
      }
      if (savedUpdatedAt) {
        setLastSaved(new Date(savedUpdatedAt).toLocaleTimeString());
      }
    }
    loadNotes();
  }, [context.storage]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement> | { target: { value: string } }) => {
    const val = e.target.value;
    setContent(val);
    setIsSaving(true);

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      const now = Date.now();
      await context.storage.set('content', val);
      await context.storage.set('updatedAt', now);
      setLastSaved(new Date(now).toLocaleTimeString());
      setIsSaving(false);
    }, 500);
  };

  const handleModeChange = async (nextMode: NotesMode) => {
    setMode(nextMode);
    await context.storage.set('mode', nextMode);
  };

  const handleCopy = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('[NotesWidget] Clipboard copy failed:', err);
    }
  };

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        color: 'var(--app-text)',
      }}
    >
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
        {([
          { id: 'plain', label: 'Texto', icon: <Type size={11} /> },
          { id: 'rich', label: 'Rich', icon: <PenTool size={11} /> },
          { id: 'markdown', label: 'Markdown', icon: <BookOpen size={11} /> },
        ] as { id: NotesMode; label: string; icon: React.ReactNode }[]).map((option) => (
          <button
            key={option.id}
            onClick={() => handleModeChange(option.id)}
            style={{
              background: mode === option.id ? 'var(--app-accent-strong)' : 'var(--app-surface-muted)',
              border: mode === option.id ? '1px solid var(--app-accent-strong)' : '1px solid var(--app-border)',
              color: mode === option.id ? '#ffffff' : 'var(--app-muted)',
              borderRadius: '6px',
              padding: '4px 8px',
              cursor: 'pointer',
              fontSize: '10px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            {option.icon} {option.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {mode === 'markdown' ? (
          <div
            onDoubleClick={() => handleModeChange('plain')}
            style={{
              width: '100%',
              height: '100%',
              background: 'var(--app-surface-muted)',
              border: '1px solid var(--app-border)',
              borderRadius: '8px',
              padding: '10px 12px',
              color: '#e2e8f0',
              fontSize: '13px',
              lineHeight: '1.6',
              overflow: 'auto',
              boxSizing: 'border-box',
            }}
          >
            {content ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            ) : (
              <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '11px' }}>Dê duplo clique para editar o texto, ou alterne para o modo "Texto" acima. Suporta marcação Markdown.</span>
            )}
          </div>
        ) : mode === 'rich' ? (
          <div
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => {
              if (e.currentTarget.innerHTML !== content) {
                handleChange({ target: { value: e.currentTarget.innerHTML } });
              }
            }}
            dangerouslySetInnerHTML={{ __html: content || '<em>Escreva em modo visual rico (cole imagens, negrito, etc)...</em>' }}
            style={{
              width: '100%',
              height: '100%',
              background: 'var(--app-surface-muted)',
              border: '1px solid var(--app-border)',
              borderRadius: '8px',
              padding: '10px 12px',
              color: 'var(--app-text)',
              fontSize: '13px',
              lineHeight: '1.6',
              overflow: 'auto',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        ) : (
          <textarea
            value={content}
            onChange={handleChange}
            placeholder="Escreva suas anotações aqui..."
            style={{
              width: '100%',
              height: '100%',
              background: 'var(--app-surface-muted)',
              border: '1px solid var(--app-border)',
              borderRadius: '8px',
              padding: '10px 12px',
              color: 'var(--app-text)',
              fontSize: '13px',
              lineHeight: '1.6',
              resize: 'none',
              outline: 'none',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
            }}
          />
        )}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '11px',
          color: '#64748b',
          padding: '0 2px',
          gap: '8px',
        }}
      >
        {/* Left: char count */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          <FileText size={12} color="var(--app-accent)" />
          <span>{content.length} caracteres</span>
        </div>

        {/* Center: save status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1, justifyContent: 'center' }}>
          {isSaving ? (
            <>
              <Save size={12} color="var(--app-accent)" />
              <span style={{ color: 'var(--app-accent)' }}>Salvando...</span>
            </>
          ) : (
            lastSaved && (
              <>
                <Clock size={12} color="#4ade80" />
                <span style={{ color: '#94a3b8' }}>Salvo às {lastSaved}</span>
              </>
            )
          )}
        </div>

        {/* Right: copy button */}
        <button
          onClick={handleCopy}
          title="Copiar texto para a área de transferência"
          disabled={!content}
          style={{
            background: copied ? 'rgba(74, 222, 128, 0.15)' : 'rgba(51, 65, 85, 0.5)',
            border: `1px solid ${copied ? 'rgba(74, 222, 128, 0.4)' : 'rgba(51, 65, 85, 0.5)'}`,
            borderRadius: '4px',
            color: copied ? '#4ade80' : content ? '#94a3b8' : '#334155',
            cursor: content ? 'pointer' : 'default',
            padding: '2px 7px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '10px',
            fontWeight: 500,
            flexShrink: 0,
            transition: 'all 0.2s',
          }}
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? 'Copiado!' : 'Copiar'}
        </button>
      </div>
    </div>
  );
};

export const notesWidget: WidgetDefinition = {
  manifest: {
    id: 'notes',
    name: 'Anotações Rápidas',
    version: '1.1.0',
    description: 'Quadro de bloco de notas simples com salvamento automático local.',
    icon: 'FileText',
    author: 'Dashboard Core',
    status: 'stable',
    defaultSize: { w: 4, h: 4 },
    minSize: { w: 3, h: 3 },
    maxSize: { w: 8, h: 8 },
    requiresAgent: false,
  },
  component: NotesWidget,
};
