import React, { useEffect, useState } from 'react';
import { WidgetDefinition, WidgetComponentProps } from '../../sdk/types';
import { Activity, Wifi, WifiOff } from 'lucide-react';
import { Badge, Button, FieldLabel, Input, Spacer, Toolbar } from '../../ui';

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

  // Monitorar estado do Agent Python (online e offline)
  useEffect(() => context.agentClient.onStatusChange(setIsAgentOnline), [context.agentClient]);

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
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', fontSize: 'var(--font-md)', color: 'var(--app-text)' }}>
      <Toolbar style={{ borderBottom: '1px solid var(--app-border)', paddingBottom: '6px' }}>
        <Activity size={16} color="var(--widget-accent)" />
        <span style={{ fontWeight: 600 }}>Status do SDK</span>
        <Spacer />
        <Badge tone={isAgentOnline ? 'success' : 'neutral'}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            {isAgentOnline ? <Wifi size={11} /> : <WifiOff size={11} />}
            {isAgentOnline ? 'Agent Ativo' : 'Agent Offline'}
          </span>
        </Badge>
      </Toolbar>

      <div style={{ background: 'var(--app-surface-muted)', border: '1px solid var(--app-border)', padding: '8px 12px', borderRadius: 'var(--radius-md)' }}>
        <div style={{ fontSize: 'var(--font-sm)', color: 'var(--app-muted)', marginBottom: '4px' }}>Dimensões Atuais (px):</div>
        <code style={{ color: 'var(--widget-accent)', fontWeight: 'bold' }}>
          {context.dimensions.width}px × {context.dimensions.height}px
        </code>
      </div>

      <div>
        <div style={{ fontSize: 'var(--font-sm)', color: 'var(--app-muted)', marginBottom: '6px' }}>Persistência Local (Dexie IDB):</div>
        <Button variant="primary" size="md" onClick={handleIncrement}>
          Contador: {clickCount}
        </Button>
      </div>

      <div>
        <FieldLabel htmlFor={`${context.instanceId}-nota`}>Nota Salva no Storage:</FieldLabel>
        <Input
          id={`${context.instanceId}-nota`}
          type="text"
          value={customNote}
          onChange={handleNoteChange}
          placeholder="Digite algo para salvar..."
          style={{ width: '100%' }}
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
