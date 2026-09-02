import React, { useEffect, useState } from 'react';
import { WidgetDefinition, WidgetComponentProps } from '../../sdk/types';
import { FolderOpen, Clock3, AlertCircle } from 'lucide-react';

interface EditedFileItem {
  path: string;
  modifiedAt: number;
}

const EditedFilesWidget: React.FC<WidgetComponentProps> = ({ context }) => {
  const [items, setItems] = useState<EditedFileItem[]>([]);
  const [isAgentReady, setIsAgentReady] = useState(context.agentClient.isConnected);

  useEffect(() => {
    const unsubscribe = context.agentClient.subscribe('handshake:ack', () => setIsAgentReady(true));
    return unsubscribe;
  }, [context.agentClient]);

  useEffect(() => {
    const saved = localStorage.getItem(`widget:${context.instanceId}:edited-files`);
    if (saved) {
      try {
        setItems(JSON.parse(saved));
      } catch {
        // ignore
      }
    }
  }, [context.instanceId]);

  useEffect(() => {
    localStorage.setItem(`widget:${context.instanceId}:edited-files`, JSON.stringify(items));
  }, [context.instanceId, items]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '8px', color: 'var(--app-text)', fontSize: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}>
        <FolderOpen size={14} color="var(--app-accent)" />
        <span>Top 10 Arquivos Editados</span>
      </div>

      {!isAgentReady && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(248, 113, 113, 0.12)', color: '#fda4af', border: '1px solid rgba(248, 113, 113, 0.3)', borderRadius: '8px', padding: '8px 10px', fontSize: '11px' }}>
          <AlertCircle size={13} />
          <span>O Agent não está ativo; o histórico aparecerá quando a indexação estiver disponível.</span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto' }}>
        {items.length === 0 ? (
          <div style={{ fontSize: '11px', color: '#64748b', border: '1px dashed rgba(51, 65, 85, 0.6)', borderRadius: '8px', padding: '10px' }}>
            Aguardando indexação local do Agent.
          </div>
        ) : items.slice(0, 10).map((item, index) => (
          <div key={`${item.path}-${index}`} style={{ background: 'var(--app-surface-muted)', border: '1px solid var(--app-border)', borderRadius: '8px', padding: '8px 9px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.path}</div>
              <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '3px' }}>
                <Clock3 size={10} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                {new Date(item.modifiedAt).toLocaleString('pt-BR')}
              </div>
            </div>
            <span style={{ fontSize: '10px', color: 'var(--app-accent)' }}>#{index + 1}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const editedFilesWidget: WidgetDefinition = {
  manifest: {
    id: 'edited-files',
    name: 'Top 10 Arquivos Editados',
    version: '0.1.0',
    description: 'Mostra um histórico inicial de arquivos alterados pelo Agent local.',
    icon: 'FolderOpen',
    author: 'Dashboard Core',
    status: 'in_development',
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 3, h: 2 },
    maxSize: { w: 6, h: 5 },
    requiresAgent: true,
  },
  component: EditedFilesWidget,
};
