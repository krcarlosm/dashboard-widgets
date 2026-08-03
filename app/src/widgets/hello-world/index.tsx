import React, { useEffect, useState } from 'react';
import { WidgetDefinition, WidgetComponentProps } from '../../sdk/types';
import { Activity, Wifi, WifiOff } from 'lucide-react';

const HelloWorldWidget: React.FC<WidgetComponentProps> = ({ context }) => {
  const [clickCount, setClickCount] = useState<number>(0);
  const [customNote, setCustomNote] = useState<string>('');
  const [isAgentOnline, setIsAgentOnline] = useState<boolean>(context.agentClient.isConnected);

  // Carregar dados salvos no Dexie (Scoped Storage)
  useEffect(() => {
    async function loadData() {
      const savedClicks = await context.storage.get<number>('clickCount', 0);
      const savedNote = await context.storage.get<string>('customNote', '');
      setClickCount(savedClicks || 0);
      setCustomNote(savedNote || '');
    }
    loadData();
  }, [context.storage]);

  // Monitorar estado do Agent Python
  useEffect(() => {
    const unsubscribe = context.agentClient.subscribe('handshake:ack', () => {
      setIsAgentOnline(true);
    });
    return unsubscribe;
  }, [context.agentClient]);

  const handleIncrement = async () => {
    const next = clickCount + 1;
    setClickCount(next);
    await context.storage.set('clickCount', next);
  };

  const handleNoteChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCustomNote(value);
    await context.storage.set('customNote', value);
  };

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      fontSize: '13px',
      color: '#e2e8f0',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #334155', paddingBottom: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
          <Activity size={16} color="#38bdf8" />
          <span>Status do SDK</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: isAgentOnline ? '#4ade80' : '#94a3b8' }}>
          {isAgentOnline ? <Wifi size={13} /> : <WifiOff size={13} />}
          <span>{isAgentOnline ? 'Agent Ativo' : 'Agent Offline'}</span>
        </div>
      </div>

      <div style={{ background: '#1e293b', padding: '8px 12px', borderRadius: '6px' }}>
        <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Dimensões Atuais (px):</div>
        <code style={{ color: '#38bdf8', fontWeight: 'bold' }}>
          {context.dimensions.width}px × {context.dimensions.height}px
        </code>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <label style={{ fontSize: '11px', color: '#94a3b8' }}>Persistência Local (Dexie IDB):</label>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={handleIncrement}
            style={{
              background: '#0284c7',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 12px',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: '12px',
              transition: 'background 0.2s',
            }}
          >
            Contador: {clickCount}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '11px', color: '#94a3b8' }}>Nota Salva no Storage:</label>
        <input
          type="text"
          value={customNote}
          onChange={handleNoteChange}
          placeholder="Digite algo para salvar..."
          style={{
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '4px',
            padding: '6px 8px',
            color: '#f8fafc',
            fontSize: '12px',
            outline: 'none',
          }}
        />
      </div>
    </div>
  );
};

export const helloWorldWidget: WidgetDefinition = {
  manifest: {
    id: 'hello-world',
    name: 'Hello World SDK',
    version: '1.0.0',
    description: 'Widget de validação do contrato do SDK, storage isolado e redimensionamento.',
    icon: 'Activity',
    author: 'Dashboard Core',
	status: 'stable',
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 3, h: 2 },
    maxSize: { w: 6, h: 5 },
    requiresAgent: false,
  },
  component: HelloWorldWidget,
};
