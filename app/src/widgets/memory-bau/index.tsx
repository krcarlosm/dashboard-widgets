import React, { useEffect, useMemo, useState } from 'react';
import { WidgetDefinition, WidgetComponentProps } from '../../sdk/types';
import { Camera, ImageIcon, FileText, RefreshCw, AlertCircle } from 'lucide-react';

interface BauItem {
  id: string;
  kind: 'image' | 'text';
  path: string;
  timestamp: number;
  label: string;
}

const MemoryBauWidget: React.FC<WidgetComponentProps> = ({ context }) => {
  const [items, setItems] = useState<BauItem[]>([]);
  const [isAgentReady, setIsAgentReady] = useState(context.agentClient.isConnected);
  const [isCapturing, setIsCapturing] = useState(false);

  useEffect(() => {
    const unsubscribe = context.agentClient.subscribe('handshake:ack', () => setIsAgentReady(true));
    const unsubscribeClipboard = context.agentClient.subscribe('clipboard:event', (payload) => {
      const nextItem: BauItem = {
        id: `${payload.kind}-${payload.timestamp || Date.now()}`,
        kind: payload.kind,
        path: payload.path,
        timestamp: payload.timestamp || Date.now(),
        label: payload.kind === 'image' ? 'Imagem de clipboard' : 'Texto de clipboard',
      };
      setItems((current) => [nextItem, ...current].slice(0, 12));
    });
    return () => {
      unsubscribe();
      unsubscribeClipboard();
    };
  }, [context.agentClient]);

  useEffect(() => {
    const saved = localStorage.getItem(`widget:${context.instanceId}:bau`);
    if (saved) {
      try {
        setItems(JSON.parse(saved));
      } catch {
        // ignore
      }
    }
  }, [context.instanceId]);

  useEffect(() => {
    localStorage.setItem(`widget:${context.instanceId}:bau`, JSON.stringify(items));
  }, [context.instanceId, items]);

  const handleCapture = () => {
    if (!isAgentReady) return;
    setIsCapturing(true);
    context.agentClient.send({ type: 'screenshot:request', payload: {} });
    setTimeout(() => setIsCapturing(false), 1200);
  };

  const formattedItems = useMemo(() => items.slice(0, 8), [items]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '8px', color: '#f8fafc', fontSize: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}>
          <Camera size={14} color="#38bdf8" />
          <span>Baú de Lembranças</span>
        </div>
        <button
          onClick={handleCapture}
          disabled={!isAgentReady}
          style={{
            background: isAgentReady ? '#0284c7' : 'rgba(51, 65, 85, 0.35)',
            border: 'none',
            borderRadius: '6px',
            padding: '4px 8px',
            color: '#fff',
            cursor: isAgentReady ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '10px',
            fontWeight: 600,
          }}
        >
          {isCapturing ? <RefreshCw size={12} className="spin" /> : <Camera size={12} />}
          Capturar
        </button>
      </div>

      {!isAgentReady && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(248, 113, 113, 0.12)', color: '#fda4af', border: '1px solid rgba(248, 113, 113, 0.3)', borderRadius: '8px', padding: '8px 10px', fontSize: '11px' }}>
          <AlertCircle size={13} />
          <span>O Agent não está disponível. Inicie o serviço local para receber itens do Baú.</span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto' }}>
        {formattedItems.length === 0 ? (
          <div style={{ fontSize: '11px', color: '#64748b', border: '1px dashed rgba(51, 65, 85, 0.6)', borderRadius: '8px', padding: '10px' }}>
            Ainda não há registros. Copie texto ou imagem e o Baú vai aparecer aqui.
          </div>
        ) : formattedItems.map((item) => (
          <div key={item.id} style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(51, 65, 85, 0.5)', borderRadius: '8px', padding: '8px 9px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', fontWeight: 600 }}>
              {item.kind === 'image' ? <ImageIcon size={12} color="#38bdf8" /> : <FileText size={12} color="#34d399" />}
              <span>{item.label}</span>
            </div>
            <div style={{ fontSize: '10px', color: '#94a3b8' }}>
              {new Date(item.timestamp).toLocaleString('pt-BR')}
            </div>
            <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px', overflowWrap: 'anywhere' }}>{item.path}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const memoryBauWidget: WidgetDefinition = {
  manifest: {
    id: 'memory-bau',
    name: 'Baú de Lembranças',
    version: '0.1.0',
    description: 'Recebe itens do Agent local e permite capturar tela sob demanda.',
    icon: 'Camera',
    author: 'Dashboard Core',
    status: 'in_development',
    defaultSize: { w: 4, h: 4 },
    minSize: { w: 3, h: 3 },
    maxSize: { w: 6, h: 7 },
    requiresAgent: true,
  },
  component: MemoryBauWidget,
};
