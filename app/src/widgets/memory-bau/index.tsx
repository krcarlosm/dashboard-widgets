import React, { useCallback, useEffect, useRef, useState } from 'react';
import { WidgetDefinition, WidgetComponentProps } from '../../sdk/types';
import {
  Camera, ImageIcon, FileText, RefreshCw, AlertCircle, Search, Settings2, Trash2, Copy, Check, ExternalLink, ChevronDown, ChevronUp,
} from 'lucide-react';

interface BauItem {
  id: string;
  kind: 'image' | 'text';
  source: 'clipboard' | 'screenshot';
  timestamp: number; // ms
  size: number;
  preview?: string | null;
  chars?: number | null;
}

interface BauListResponse {
  items: BauItem[];
  counts: { text: number; image: number };
  retentionHours: number;
  retentionOptions: number[];
}

interface BauConfig {
  topN?: number;
}

type BauTab = 'text' | 'image';

const TOP_N_OPTIONS = [10, 20, 50];
const DEFAULT_TOP_N = 20;
const REFRESH_DEBOUNCE_MS = 300;

const formatRelative = (timestamp: number): string => {
  const diffMinutes = Math.floor((Date.now() - timestamp) / 60000);
  if (diffMinutes < 1) return 'agora';
  if (diffMinutes < 60) return `há ${diffMinutes} min`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `há ${diffHours} h`;
  return new Date(timestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const MemoryBauWidget: React.FC<WidgetComponentProps<BauConfig>> = ({ context }) => {
  const { agentClient, config, updateConfig } = context;
  const topN = config.topN ?? DEFAULT_TOP_N;
  // Em widgets estreitos, abas e botões mostram só ícones e números.
  const isCompact = context.dimensions.width > 0 && context.dimensions.width < 330;

  const [isAgentReady, setIsAgentReady] = useState(agentClient.isConnected);
  const [tab, setTab] = useState<BauTab>('text');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [items, setItems] = useState<BauItem[]>([]);
  const [counts, setCounts] = useState({ text: 0, image: 0 });
  const [retentionHours, setRetentionHours] = useState(72);
  const [retentionOptions, setRetentionOptions] = useState<number[]>([24, 48, 72]);
  const [error, setError] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, string>>({});
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const thumbnailsRef = useRef<Record<string, string>>({});
  const refreshTimerRef = useRef<any>(null);

  // Histórico antigo ficava no localStorage do widget; agora o agente é a fonte da verdade.
  useEffect(() => {
    localStorage.removeItem(`widget:${context.instanceId}:bau`);
  }, [context.instanceId]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const loadItems = useCallback(async () => {
    if (!agentClient.isConnected) return;
    const params = new URLSearchParams({ kind: tab, limit: String(topN) });
    if (tab === 'text' && debouncedQuery) params.set('q', debouncedQuery);
    try {
      const data = await agentClient.requestJson<BauListResponse>(`/bau/items?${params}`);
      setItems(data.items);
      setCounts(data.counts);
      setRetentionHours(data.retentionHours);
      setRetentionOptions(data.retentionOptions);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar o Baú.');
    }
  }, [agentClient, tab, topN, debouncedQuery]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => void loadItems(), REFRESH_DEBOUNCE_MS);
  }, [loadItems]);

  useEffect(() => {
    void loadItems();
  }, [loadItems, isAgentReady]);

  useEffect(() => {
    const unsubscribers = [
      agentClient.onStatusChange(setIsAgentReady),
      agentClient.subscribe('bau:item-added', scheduleRefresh),
      agentClient.subscribe('bau:items-removed', scheduleRefresh),
      agentClient.subscribe('bau:settings', scheduleRefresh),
      agentClient.subscribe('screenshot:result', () => {
        setIsCapturing(false);
        setTab('image');
      }),
      agentClient.subscribe('screenshot:error', (payload) => {
        setIsCapturing(false);
        setError(`Falha na captura: ${payload?.error ?? 'erro desconhecido'}`);
      }),
    ];
    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [agentClient, scheduleRefresh]);

  // Miniaturas: baixadas com o token no header e exibidas via blob URL.
  useEffect(() => {
    if (tab !== 'image') return;
    let cancelled = false;
    items.forEach(async (item) => {
      if (item.kind !== 'image' || thumbnailsRef.current[item.id]) return;
      try {
        const blob = await agentClient.requestBlob(`/bau/items/${encodeURIComponent(item.id)}/thumbnail`);
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        thumbnailsRef.current = { ...thumbnailsRef.current, [item.id]: url };
        setThumbnails(thumbnailsRef.current);
      } catch {
        // A miniatura é opcional; o item continua visível sem ela.
      }
    });
    return () => {
      cancelled = true;
    };
  }, [agentClient, items, tab]);

  useEffect(() => () => {
    Object.values(thumbnailsRef.current).forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const handleCapture = () => {
    if (!isAgentReady || isCapturing) return;
    setIsCapturing(true);
    agentClient.send({ type: 'screenshot:request', payload: {} });
    setTimeout(() => setIsCapturing(false), 15000);
  };

  const handleCopy = async (item: BauItem) => {
    try {
      await agentClient.requestJson(`/bau/items/${encodeURIComponent(item.id)}/copy`, { method: 'POST' });
      setCopiedId(item.id);
      setTimeout(() => setCopiedId((current) => (current === item.id ? null : current)), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível copiar o item.');
    }
  };

  const handleDelete = async (item: BauItem) => {
    try {
      await agentClient.requestJson(`/bau/items/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      setItems((current) => current.filter((entry) => entry.id !== item.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível excluir o item.');
    }
  };

  const handleToggleExpand = async (item: BauItem) => {
    if (expanded[item.id] !== undefined) {
      setExpanded(({ [item.id]: _removed, ...rest }) => rest);
      return;
    }
    try {
      const data = await agentClient.requestJson<{ text: string }>(`/bau/items/${encodeURIComponent(item.id)}/content`);
      setExpanded((current) => ({ ...current, [item.id]: data.text }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível abrir o texto.');
    }
  };

  const handleOpenImage = async (item: BauItem) => {
    try {
      const blob = await agentClient.requestBlob(`/bau/items/${encodeURIComponent(item.id)}/content`);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível abrir a imagem.');
    }
  };

  const handleRetentionChange = async (hours: number) => {
    try {
      const data = await agentClient.requestJson<{ retentionHours: number }>('/bau/settings', {
        method: 'PUT',
        body: JSON.stringify({ retentionHours: hours }),
      });
      setRetentionHours(data.retentionHours);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível alterar a retenção.');
    }
  };

  const handleClear = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 4000);
      return;
    }
    setConfirmClear(false);
    try {
      await agentClient.requestJson('/bau/items', { method: 'DELETE' });
      setItems([]);
      setCounts({ text: 0, image: 0 });
      setShowSettings(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível limpar o Baú.');
    }
  };

  const iconButtonStyle = (active = false): React.CSSProperties => ({
    background: active ? 'var(--app-accent-soft)' : 'transparent',
    border: `1px solid ${active ? 'var(--app-accent-border)' : 'var(--app-border)'}`,
    borderRadius: '6px',
    color: active ? 'var(--app-accent)' : 'var(--app-muted)',
    cursor: 'pointer',
    padding: '4px 6px',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '10px',
    fontWeight: 600,
  });

  const selectStyle: React.CSSProperties = {
    background: 'var(--app-input)',
    border: '1px solid var(--app-border)',
    borderRadius: '6px',
    color: 'var(--app-text)',
    fontSize: '11px',
    padding: '3px 6px',
  };

  if (!isAgentReady) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'flex-start', fontSize: '11px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(248, 113, 113, 0.12)', color: '#fda4af', border: '1px solid rgba(248, 113, 113, 0.3)', borderRadius: '8px', padding: '8px 10px' }}>
          <AlertCircle size={13} />
          <span>O Agent não está disponível. Inicie o serviço local para ver o Baú.</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '8px', color: 'var(--app-text)', fontSize: '12px' }}>
      {/* Abas e ações */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: '4px', background: 'var(--app-surface-muted)', padding: '2px', borderRadius: '6px', border: '1px solid var(--app-border)' }}>
          {([
            { id: 'text', label: 'Texto', icon: <FileText size={11} />, count: counts.text },
            { id: 'image', label: 'Imagens', icon: <ImageIcon size={11} />, count: counts.image },
          ] as { id: BauTab; label: string; icon: React.ReactNode; count: number }[]).map((option) => (
            <button
              key={option.id}
              title={option.label}
              onClick={() => setTab(option.id)}
              style={{
                background: tab === option.id ? 'var(--app-accent-strong)' : 'transparent',
                color: tab === option.id ? '#ffffff' : 'var(--app-muted)',
                border: 'none',
                borderRadius: '4px',
                padding: '3px 8px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              {option.icon} {!isCompact && option.label} <span style={{ opacity: 0.75 }}>{option.count}</span>
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={handleCapture} disabled={isCapturing} title="Capturar a tela inteira" style={iconButtonStyle()}>
          {isCapturing ? <RefreshCw size={12} className="spin" /> : <Camera size={12} />}
        </button>
        <button onClick={() => setShowSettings((value) => !value)} title="Configurações do Baú" style={iconButtonStyle(showSettings)}>
          <Settings2 size={12} />
        </button>
      </div>

      {showSettings && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', background: 'var(--app-surface-muted)', border: '1px solid var(--app-border)', borderRadius: '8px', padding: '8px', fontSize: '11px', flexShrink: 0 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--app-muted)' }}>
            Guardar por
            <select value={retentionHours} onChange={(event) => handleRetentionChange(Number(event.target.value))} style={selectStyle}>
              {retentionOptions.map((hours) => <option key={hours} value={hours}>{hours} h</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--app-muted)' }}>
            Exibir
            <select value={topN} onChange={(event) => updateConfig({ topN: Number(event.target.value) })} style={selectStyle}>
              {TOP_N_OPTIONS.map((value) => <option key={value} value={value}>{value} itens</option>)}
            </select>
          </label>
          <button
            onClick={handleClear}
            title="Apagar todos os textos e imagens do Baú"
            style={{ ...iconButtonStyle(), marginLeft: 'auto', color: '#ef4444', borderColor: confirmClear ? 'rgba(239, 68, 68, 0.6)' : 'rgba(239, 68, 68, 0.35)', background: confirmClear ? 'rgba(239, 68, 68, 0.15)' : 'transparent' }}
          >
            <Trash2 size={11} /> {confirmClear ? 'Confirmar limpeza?' : 'Limpar Baú'}
          </button>
        </div>
      )}

      {tab === 'text' && (
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Search size={12} color="var(--app-muted)" style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar nos textos copiados..."
            style={{ width: '100%', boxSizing: 'border-box', background: 'var(--app-input)', border: '1px solid var(--app-border)', borderRadius: '6px', padding: '5px 8px 5px 26px', color: 'var(--app-text)', fontSize: '11px', outline: 'none' }}
          />
        </div>
      )}

      {error && (
        <div onClick={() => setError(null)} title="Clique para fechar" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(248, 113, 113, 0.12)', color: '#fda4af', border: '1px solid rgba(248, 113, 113, 0.3)', borderRadius: '8px', padding: '6px 8px', fontSize: '11px', cursor: 'pointer', flexShrink: 0 }}>
          <AlertCircle size={12} /> <span>{error}</span>
        </div>
      )}

      {/* Lista */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: tab === 'image' ? 'grid' : 'flex', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', flexDirection: 'column', gap: '6px', alignContent: 'start' }}>
        {items.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', fontSize: '11px', color: 'var(--app-muted)', border: '1px dashed var(--app-border)', borderRadius: '8px', padding: '10px' }}>
            {debouncedQuery
              ? 'Nenhum texto encontrado para essa busca.'
              : tab === 'text'
                ? `Nenhum texto nas últimas ${retentionHours} h. Copie algo e ele aparece aqui.`
                : `Nenhuma imagem nas últimas ${retentionHours} h. Copie uma imagem ou use o botão de captura.`}
          </div>
        ) : items.map((item) => {
          const isCopied = copiedId === item.id;
          const fullText = expanded[item.id];
          const isTruncated = (item.chars ?? 0) > (item.preview?.length ?? 0);
          const timeLabel = (
            <span title={new Date(item.timestamp).toLocaleString('pt-BR')} style={{ fontSize: '10px', color: 'var(--app-muted)' }}>
              {item.source === 'screenshot' ? 'Captura · ' : ''}{formatRelative(item.timestamp)}
            </span>
          );
          const actions = (
            <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }} onClick={(event) => event.stopPropagation()}>
              {item.kind === 'image' && (
                <button onClick={() => handleOpenImage(item)} title="Abrir imagem em nova aba" style={{ ...iconButtonStyle(), border: 'none', padding: '2px' }}>
                  <ExternalLink size={11} />
                </button>
              )}
              <button onClick={() => handleDelete(item)} title="Excluir do Baú" style={{ ...iconButtonStyle(), border: 'none', padding: '2px' }}>
                <Trash2 size={11} />
              </button>
            </div>
          );

          if (item.kind === 'image') {
            return (
              <div
                key={item.id}
                onClick={() => handleCopy(item)}
                title="Clique para copiar a imagem"
                style={{ background: 'var(--app-surface-muted)', border: `1px solid ${isCopied ? '#4ade80' : 'var(--app-border)'}`, borderRadius: '8px', padding: '6px', cursor: 'copy', display: 'flex', flexDirection: 'column', gap: '4px' }}
              >
                <div style={{ height: '72px', borderRadius: '6px', background: 'var(--app-surface-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {thumbnails[item.id]
                    ? <img src={thumbnails[item.id]} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                    : <ImageIcon size={18} color="var(--app-muted)" />}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                  {isCopied ? <span style={{ fontSize: '10px', color: '#4ade80' }}>Copiada!</span> : timeLabel}
                  {actions}
                </div>
              </div>
            );
          }

          return (
            <div
              key={item.id}
              onClick={() => handleCopy(item)}
              title="Clique para copiar o texto"
              style={{ background: 'var(--app-surface-muted)', border: `1px solid ${isCopied ? '#4ade80' : 'var(--app-border)'}`, borderRadius: '8px', padding: '7px 9px', cursor: 'copy', flexShrink: 0 }}
            >
              <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: '11.5px', lineHeight: 1.45, maxHeight: fullText !== undefined ? '220px' : undefined, overflowY: fullText !== undefined ? 'auto' : undefined }}>
                {fullText ?? item.preview}{fullText === undefined && isTruncated ? '…' : ''}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '5px' }}>
                {isCopied
                  ? <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: '#4ade80' }}><Check size={10} /> Copiado!</span>
                  : timeLabel}
                {isTruncated && (
                  <button
                    onClick={(event) => { event.stopPropagation(); void handleToggleExpand(item); }}
                    style={{ ...iconButtonStyle(), border: 'none', padding: '0 2px', color: 'var(--app-accent)' }}
                  >
                    {fullText !== undefined
                      ? <><ChevronUp size={10} /> Recolher</>
                      : <><ChevronDown size={10} /> Ver tudo{!isCompact && ` (${item.chars} caracteres)`}</>}
                  </button>
                )}
                <div style={{ flex: 1 }} />
                {!isCopied && <Copy size={10} color="var(--app-muted)" />}
                {actions}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const memoryBauWidget: WidgetDefinition<BauConfig> = {
  manifest: {
    id: 'memory-bau',
    name: 'Baú de Lembranças',
    version: '1.0.0',
    description: 'Histórico de textos e imagens copiados e capturas de tela, com prévia, busca e cópia com um clique.',
    icon: 'Camera',
    author: 'Dashboard Core',
    status: 'stable',
    defaultSize: { w: 4, h: 5 },
    minSize: { w: 3, h: 4 },
    maxSize: { w: 8, h: 8 },
    requiresAgent: true,
  },
  component: MemoryBauWidget,
};
