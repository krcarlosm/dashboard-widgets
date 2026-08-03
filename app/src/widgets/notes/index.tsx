import React, { useEffect, useState, useRef } from 'react';
import { WidgetDefinition, WidgetComponentProps } from '../../sdk/types';
import { FileText, Save, Clock, Copy, Check, Type, PenTool, BookOpen } from 'lucide-react';

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

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
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
        color: '#f8fafc',
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
              background: mode === option.id ? '#0284c7' : 'rgba(15, 23, 42, 0.6)',
              border: mode === option.id ? '1px solid #0284c7' : '1px solid rgba(51, 65, 85, 0.6)',
              color: mode === option.id ? '#ffffff' : '#94a3b8',
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

      <div style={{ flex: 1, position: 'relative' }}>
        {mode === 'markdown' ? (
          <div
            style={{
              width: '100%',
              height: '100%',
              background: 'rgba(15, 23, 42, 0.6)',
              border: '1px solid rgba(51, 65, 85, 0.6)',
              borderRadius: '8px',
              padding: '10px 12px',
              color: '#e2e8f0',
              fontSize: '12px',
              lineHeight: '1.6',
              overflow: 'auto',
              boxSizing: 'border-box',
              whiteSpace: 'pre-wrap',
            }}
          >
            {content || 'Pré-visualização Markdown aparecerá aqui.'}
          </div>
        ) : mode === 'rich' ? (
          <textarea
            value={content}
            onChange={handleChange}
            placeholder="Use texto com marcação simples..."
            style={{
              width: '100%',
              height: '100%',
              background: 'rgba(15, 23, 42, 0.6)',
              border: '1px solid rgba(51, 65, 85, 0.6)',
              borderRadius: '8px',
              padding: '10px 12px',
              color: '#f8fafc',
              fontSize: '13px',
              lineHeight: '1.6',
              resize: 'none',
              outline: 'none',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
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
              background: 'rgba(15, 23, 42, 0.6)',
              border: '1px solid rgba(51, 65, 85, 0.6)',
              borderRadius: '8px',
              padding: '10px 12px',
              color: '#f8fafc',
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
          <FileText size={12} color="#38bdf8" />
          <span>{content.length} caracteres</span>
        </div>

        {/* Center: save status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1, justifyContent: 'center' }}>
          {isSaving ? (
            <>
              <Save size={12} color="#38bdf8" />
              <span style={{ color: '#38bdf8' }}>Salvando...</span>
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
