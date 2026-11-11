import React, { useCallback, useEffect, useRef, useState } from 'react';
import { WidgetDefinition, WidgetComponentProps } from '../../sdk/types';
import { FolderOpen, FolderPlus, RefreshCw, Settings2, X } from 'lucide-react';
import { AgentOfflineBanner, Badge, Banner, IconButton, Input, SegmentedControl, Spacer, Toolbar } from '../../ui';
import { SendToButton } from '../../ui/SendTo';

// ─────────────────────────────────────────────────────────────────────────────
// Top 10 Arquivos da Semana — arquivos mais abertos e editados nos últimos 7 dias.
//
// O agente registra:
//  • [Aberto]: aberturas lidas dos "recentes" do sistema (Windows: pasta Recent;
//    Linux: recently-used.xbel), a cada 2 minutos.
//  • [Editado]: mudanças na data de modificação desses arquivos e, se houver,
//    gravações nas pastas monitoradas (configuradas aqui). Salvamentos
//    automáticos em sequência contam como uma edição (janela de 5 min).
// Clicar no nome abre o arquivo no aplicativo padrão; o ícone de pasta mostra
// o arquivo no Explorer/gerenciador de arquivos.
// ─────────────────────────────────────────────────────────────────────────────

interface TopFile {
  path: string;
  name: string;
  folder: string;
  opened: number;
  edited: number;
  total: number;
  lastOpened: number | null;
  lastEdited: number | null;
  lastAccess: number;
}

interface TopResponse {
  items: TopFile[];
  windowDays: number;
  folders: string[];
}

type FileFilter = 'all' | 'opened' | 'edited';

interface TopFilesConfig {
  filter?: FileFilter;
}

const REFRESH_DEBOUNCE_MS = 500;

const FILTERS: { id: FileFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'opened', label: 'Abertos' },
  { id: 'edited', label: 'Editados' },
];

const formatRelative = (timestamp: number): string => {
  const diffMinutes = Math.floor((Date.now() - timestamp) / 60000);
  if (diffMinutes < 1) return 'agora';
  if (diffMinutes < 60) return `há ${diffMinutes} min`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `há ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  return diffDays === 1 ? 'ontem' : `há ${diffDays} dias`;
};

const TopFilesWidget: React.FC<WidgetComponentProps<TopFilesConfig>> = ({ context }) => {
  const { agentClient, config, updateConfig } = context;
  const filter = config.filter ?? 'all';
  const isCompact = context.dimensions.width > 0 && context.dimensions.width < 330;

  const [isAgentReady, setIsAgentReady] = useState(agentClient.isConnected);
  const [items, setItems] = useState<TopFile[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [windowDays, setWindowDays] = useState(7);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [newFolder, setNewFolder] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);
  const refreshTimerRef = useRef<any>(null);

  // A versão anterior guardava uma lista local que nunca era preenchida.
  useEffect(() => {
    localStorage.removeItem(`widget:${context.instanceId}:edited-files`);
  }, [context.instanceId]);

  const loadItems = useCallback(async () => {
    if (!agentClient.isConnected) return;
    const params = new URLSearchParams({ limit: '10' });
    if (filter !== 'all') params.set('kind', filter);
    try {
      const data = await agentClient.requestJson<TopResponse>(`/files/top?${params}`);
      setItems(data.items);
      setFolders(data.folders);
      setWindowDays(data.windowDays);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar o Top 10.');
    } finally {
      setHasLoaded(true);
    }
  }, [agentClient, filter]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => void loadItems(), REFRESH_DEBOUNCE_MS);
  }, [loadItems]);

  useEffect(() => {
    void loadItems();
  }, [loadItems, isAgentReady]);

  useEffect(() => {
    const unsubscribers = [agentClient.onStatusChange(setIsAgentReady), agentClient.subscribe('files:updated', scheduleRefresh)];
    // Os tempos relativos ("há 5 min") envelhecem mesmo sem eventos novos.
    const interval = setInterval(scheduleRefresh, 5 * 60 * 1000);
    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      clearInterval(interval);
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [agentClient, scheduleRefresh]);

  const handleScan = async () => {
    setIsScanning(true);
    try {
      await agentClient.requestJson('/files/scan', { method: 'POST' });
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível atualizar.');
    } finally {
      setIsScanning(false);
    }
  };

  const handleOpen = async (item: TopFile, action: 'open' | 'reveal') => {
    try {
      await agentClient.requestJson(`/files/${action}`, { method: 'POST', body: JSON.stringify({ path: item.path }) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível abrir o arquivo.');
      scheduleRefresh();
    }
  };

  const saveFolders = async (next: string[]) => {
    try {
      const data = await agentClient.requestJson<{ folders: string[] }>('/files/folders', { method: 'PUT', body: JSON.stringify({ folders: next }) });
      setFolders(data.folders);
      setNewFolder('');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar as pastas.');
    }
  };

  if (!isAgentReady) {
    return <AgentOfflineBanner what="ver os arquivos da semana" />;
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '8px', color: 'var(--app-text)', fontSize: '12px' }}>
      {/* Filtros e ações */}
      <Toolbar>
        <SegmentedControl
          ariaLabel="Filtro"
          compact={isCompact}
          value={filter}
          onChange={(next) => updateConfig({ filter: next })}
          options={FILTERS}
        />
        <Spacer />
        <IconButton label="Atualizar agora" bordered onClick={handleScan} disabled={isScanning} icon={<RefreshCw size={12} className={isScanning ? 'spin' : undefined} />} />
        <IconButton label="Pastas monitoradas" bordered active={showSettings} onClick={() => setShowSettings((value) => !value)} icon={<Settings2 size={12} />} />
      </Toolbar>

      {error && <Banner onClose={() => setError(null)}>{error}</Banner>}

      {showSettings && (
        <div style={{ background: 'var(--app-surface-muted)', border: '1px solid var(--app-border)', borderRadius: '8px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0, fontSize: '11px' }}>
          <span style={{ color: 'var(--app-muted)' }}>
            Arquivos abertos já são detectados automaticamente. Adicione pastas para registrar também edições de arquivos que você não abre pelo Explorer.
          </span>
          {folders.map((folder) => (
            <div key={folder} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FolderOpen size={12} color="var(--widget-accent)" style={{ flexShrink: 0 }} />
              <span title={folder} style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder}</span>
              <IconButton label="Parar de monitorar" onClick={() => void saveFolders(folders.filter((item) => item !== folder))} icon={<X size={12} />} style={{ padding: 0 }} />
            </div>
          ))}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (newFolder.trim()) void saveFolders([...folders, newFolder.trim()]);
            }}
            style={{ display: 'flex', gap: '6px' }}
          >
            <Input
              aria-label="Caminho da pasta"
              value={newFolder}
              onChange={(event) => setNewFolder(event.target.value)}
              placeholder="Cole o caminho de uma pasta"
              style={{ flex: 1, fontSize: 'var(--font-sm)', padding: '4px 6px' }}
            />
            <IconButton type="submit" label="Adicionar pasta" bordered icon={<FolderPlus size={12} />} />
          </form>
        </div>
      )}

      {/* Lista */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {hasLoaded && items.length === 0 && (
          <div style={{ fontSize: '11px', color: 'var(--app-muted)', border: '1px dashed var(--app-border)', borderRadius: '8px', padding: '10px' }}>
            Nenhum arquivo {filter === 'opened' ? 'aberto' : filter === 'edited' ? 'editado' : 'aberto ou editado'} nos últimos {windowDays} dias.
          </div>
        )}
        {items.map((item, index) => (
          <div
            key={item.path}
            data-testid="top-file"
            style={{ background: 'var(--app-surface-muted)', border: '1px solid var(--app-border)', borderRadius: '8px', padding: '6px 8px', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--widget-accent)', width: '18px', textAlign: 'right', flexShrink: 0 }}>{index + 1}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
                {item.opened > 0 && <Badge tone="accent">{isCompact ? 'A' : 'Aberto'}</Badge>}
                {item.edited > 0 && <Badge tone="warning">{isCompact ? 'E' : 'Editado'}</Badge>}
                <a
                  href="#"
                  onClick={(event) => {
                    event.preventDefault();
                    void handleOpen(item, 'open');
                  }}
                  title={`Abrir ${item.path}`}
                  style={{ color: 'var(--app-text)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none', minWidth: 0 }}
                  onMouseEnter={(event) => (event.currentTarget.style.textDecoration = 'underline')}
                  onMouseLeave={(event) => (event.currentTarget.style.textDecoration = 'none')}
                >
                  {item.name}
                </a>
              </div>
              <div
                title={[item.opened ? `Aberto ${item.opened}×` : '', item.edited ? `Editado ${item.edited}×` : ''].filter(Boolean).join(' · ')}
                style={{ fontSize: '10px', color: 'var(--app-muted)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {formatRelative(item.lastAccess)} · {item.total}× · {item.folder}
              </div>
            </div>
            <SendToButton
              actions={context.actions}
              kinds={['file']}
              iconOnly
              label="Enviar arquivo para…"
              build={() => [{ kind: 'file', path: item.path, name: item.name }]}
              style={{ padding: '2px' }}
            />
            <IconButton label="Mostrar na pasta" onClick={() => void handleOpen(item, 'reveal')} icon={<FolderOpen size={13} />} style={{ padding: '2px' }} />
          </div>
        ))}
      </div>
    </div>
  );
};

export const editedFilesWidget: WidgetDefinition<TopFilesConfig> = {
  manifest: {
    id: 'edited-files',
    name: 'Top 10 Arquivos da Semana',
    version: '1.1.0',
    description: 'Os 10 arquivos que você mais abriu e editou nos últimos 7 dias, com link para abrir e envio para Anotações ou Conversor.',
    icon: 'FolderOpen',
    author: 'Dashboard Core',
    status: 'stable',
    defaultSize: { w: 4, h: 5 },
    minSize: { w: 3, h: 3 },
    maxSize: { w: 8, h: 8 },
    requiresAgent: true,
  },
  component: TopFilesWidget,
  lifecycle: {
    getExportableDefaults: () => ({ filter: 'all' }),
  },
};
