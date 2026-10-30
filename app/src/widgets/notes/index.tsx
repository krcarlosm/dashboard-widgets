import React, { useEffect, useState, useRef } from 'react';
import { WidgetDefinition, WidgetComponentProps } from '../../sdk/types';
import { FileText, Save, Clock, Copy, Check, Type, PenTool, BookOpen, X } from 'lucide-react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { escapeHtml, htmlToMarkdown, markdownToHtml, migrateLegacyContent, sanitizeHtml } from './markdown';

type NotesMode = 'plain' | 'rich' | 'markdown';

// Permite exibir no modo Markdown as imagens coladas no modo Rich (data URLs).
const allowInlineImages = (url: string) => (url.startsWith('data:image/') ? url : defaultUrlTransform(url));

const NotesWidget: React.FC<WidgetComponentProps> = ({ context }) => {
  // `content` é sempre Markdown, independentemente do modo de edição.
  const [content, setContent] = useState<string>('');
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [confirmClear, setConfirmClear] = useState<boolean>(false);
  const [mode, setMode] = useState<NotesMode>('plain');
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  // Incrementado quando o conteúdo muda fora do editor Rich (carga, limpeza),
  // para que o editor seja repopulado.
  const [externalRevision, setExternalRevision] = useState<number>(0);
  const saveTimeoutRef = useRef<any>(null);
  const pendingSaveRef = useRef<(() => void) | null>(null);
  const confirmTimeoutRef = useRef<any>(null);
  const richRef = useRef<HTMLDivElement>(null);

  // Load saved notes on mount
  useEffect(() => {
    async function loadNotes() {
      let savedContent = (await context.storage.get<string>('content', '')) ?? '';
      const savedUpdatedAt = await context.storage.get<number>('updatedAt', 0);
      const savedMode = await context.storage.get<NotesMode>('mode', 'plain');
      const contentFormat = await context.storage.get<string>('contentFormat');

      if (contentFormat !== 'markdown') {
        const migrated = migrateLegacyContent(savedContent);
        if (migrated.changed) {
          await context.storage.set('contentLegacy', savedContent);
          await context.storage.set('content', migrated.content);
          savedContent = migrated.content;
        }
        await context.storage.set('contentFormat', 'markdown');
      }

      setContent(savedContent);
      if (savedMode) {
        setMode(savedMode);
      }
      if (savedUpdatedAt) {
        setLastSaved(new Date(savedUpdatedAt).toLocaleTimeString());
      }
      setIsLoaded(true);
      setExternalRevision((value) => value + 1);
    }
    loadNotes();
  }, [context.storage]);

  // Popula o editor Rich ao entrar no modo ou quando o conteúdo muda externamente.
  useEffect(() => {
    if (mode !== 'rich' || !isLoaded || !richRef.current) return;
    richRef.current.innerHTML = markdownToHtml(content);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, isLoaded, externalRevision]);

  // Salva alterações pendentes ao remover o widget ou recarregar a página.
  useEffect(() => {
    const flush = () => pendingSaveRef.current?.();
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      flush();
    };
  }, []);

  const persist = async (value: string) => {
    const now = Date.now();
    await context.storage.set('content', value);
    await context.storage.set('updatedAt', now);
    setLastSaved(new Date(now).toLocaleTimeString());
    setIsSaving(false);
  };

  const cancelPendingSave = () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    pendingSaveRef.current = null;
  };

  const scheduleSave = (produceValue: () => string) => {
    setIsSaving(true);
    cancelPendingSave();

    const run = () => {
      cancelPendingSave();
      const value = produceValue();
      setContent(value);
      void persist(value);
    };

    pendingSaveRef.current = run;
    saveTimeoutRef.current = setTimeout(run, 500);
  };

  const handlePlainChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);
    scheduleSave(() => val);
  };

  const readRichEditor = (): string => {
    const el = richRef.current;
    if (!el) return content;
    return htmlToMarkdown(el.innerHTML);
  };

  const handleRichInput = () => {
    const el = richRef.current;
    if (!el) return;
    // Mantém o editor realmente vazio para o placeholder via CSS (:empty) reaparecer.
    if (!el.textContent?.trim() && !el.querySelector('img')) {
      el.innerHTML = '';
    }
    scheduleSave(readRichEditor);
  };

  const insertRichHtml = (html: string) => {
    richRef.current?.focus();
    document.execCommand('insertHTML', false, html);
    handleRichInput();
  };

  const handleRichPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const imageFile = Array.from(e.clipboardData.files).find((file) => file.type.startsWith('image/'));
    e.preventDefault();

    if (imageFile) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          insertRichHtml(sanitizeHtml(`<img src="${reader.result}" alt="">`));
        }
      };
      reader.readAsDataURL(imageFile);
      return;
    }

    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    insertRichHtml(html ? sanitizeHtml(html) : escapeHtml(text).replace(/\n/g, '<br>'));
  };

  const handleModeChange = async (nextMode: NotesMode) => {
    if (nextMode === mode) return;
    // Conclui imediatamente a gravação pendente para que o novo modo veja o texto atual.
    pendingSaveRef.current?.();
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

  const handleClear = async () => {
    if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);

    if (!confirmClear) {
      setConfirmClear(true);
      confirmTimeoutRef.current = setTimeout(() => setConfirmClear(false), 4000);
      return;
    }

    setConfirmClear(false);
    cancelPendingSave();
    setContent('');
    setExternalRevision((value) => value + 1);
    await persist('');
  };

  // Em widgets estreitos o rodapé mostra só ícones (o texto fica no tooltip).
  const isCompact = context.dimensions.width > 0 && context.dimensions.width < 340;

  const editorBoxStyle: React.CSSProperties = {
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
            title={option.label}
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
            {option.icon} {!isCompact && option.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {mode === 'markdown' ? (
          <div className="notes-markdown" onDoubleClick={() => handleModeChange('plain')} style={editorBoxStyle}>
            {content ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={allowInlineImages}>{content}</ReactMarkdown>
            ) : (
              <span style={{ color: 'var(--app-muted)', fontStyle: 'italic', fontSize: '11px' }}>Dê duplo clique para editar o texto, ou alterne para o modo "Texto" acima. Suporta marcação Markdown.</span>
            )}
          </div>
        ) : mode === 'rich' ? (
          <div
            ref={richRef}
            className="notes-rich"
            contentEditable
            suppressContentEditableWarning
            data-placeholder="Escreva em modo visual rico (cole imagens, negrito, etc)..."
            onInput={handleRichInput}
            onPaste={handleRichPaste}
            onBlur={() => pendingSaveRef.current?.()}
            style={editorBoxStyle}
          />
        ) : (
          <textarea
            value={content}
            onChange={handlePlainChange}
            onBlur={() => pendingSaveRef.current?.()}
            placeholder="Escreva suas anotações aqui..."
            style={{ ...editorBoxStyle, resize: 'none', fontFamily: 'inherit' }}
          />
        )}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '11px',
          color: 'var(--app-muted)',
          padding: '0 2px',
          gap: '8px',
        }}
      >
        {/* Left: char count */}
        <div title={`${content.length} caracteres`} style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          <FileText size={12} color="var(--app-accent)" />
          <span>{isCompact ? content.length : `${content.length} caracteres`}</span>
        </div>

        {/* Center: save status */}
        <div
          title={isSaving ? 'Salvando...' : lastSaved ? `Salvo às ${lastSaved}` : undefined}
          style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1, minWidth: 0, justifyContent: 'center', whiteSpace: 'nowrap' }}
        >
          {isSaving ? (
            <>
              <Save size={12} color="var(--app-accent)" />
              {!isCompact && <span style={{ color: 'var(--app-accent)' }}>Salvando...</span>}
            </>
          ) : (
            lastSaved && (
              <>
                <Clock size={12} color="#4ade80" />
                {!isCompact && <span style={{ color: 'var(--app-muted)' }}>Salvo às {lastSaved}</span>}
              </>
            )
          )}
        </div>

        {/* Right: clear + copy buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <button
            onClick={handleClear}
            title={confirmClear ? 'Clique novamente para apagar a anotação' : 'Apagar anotação'}
            disabled={!content}
            style={{
              background: confirmClear ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
              border: `1px solid ${confirmClear ? 'rgba(239, 68, 68, 0.6)' : content ? 'rgba(239, 68, 68, 0.35)' : 'var(--app-border)'}`,
              borderRadius: '4px',
              color: content ? '#ef4444' : 'var(--app-muted)',
              cursor: content ? 'pointer' : 'default',
              padding: '2px 7px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '10px',
              fontWeight: 600,
              transition: 'all 0.2s',
            }}
          >
            <X size={11} />
            {confirmClear ? 'Confirmar?' : !isCompact && 'Apagar'}
          </button>

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
              transition: 'all 0.2s',
            }}
          >
            {copied ? <Check size={11} /> : <Copy size={11} />}
            {!isCompact && (copied ? 'Copiado!' : 'Copiar')}
          </button>
        </div>
      </div>
    </div>
  );
};

export const notesWidget: WidgetDefinition = {
  manifest: {
    id: 'notes',
    name: 'Anotações Rápidas',
    version: '1.2.0',
    description: 'Bloco de notas em Markdown com modos Texto, Rich e visualização, e salvamento automático local.',
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
