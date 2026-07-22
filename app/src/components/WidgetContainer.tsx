import React, { useEffect, useRef, useState } from 'react';
import { WidgetDefinition, WidgetContext } from '../sdk/types';
import { ScopedWidgetStorage } from '../sdk/storage';
import { defaultAgentClient } from '../sdk/agentClient';
import { useDashboardStore } from '../store/dashboardStore';
import { X, GripHorizontal, Activity, Layers } from 'lucide-react';

interface WidgetContainerProps {
  instanceId: string;
  widgetDef: WidgetDefinition;
  config: Record<string, any>;
  onRemove: () => void;
}

export const WidgetContainer: React.FC<WidgetContainerProps> = ({
  instanceId,
  widgetDef,
  config,
  onRemove,
}) => {
  const updateWidgetConfig = useDashboardStore((state) => state.updateWidgetConfig);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const storage = useRef(new ScopedWidgetStorage(instanceId)).current;

  // Medir dimensões reais do contêiner para repassar via Context ao widget
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({ width: Math.round(width), height: Math.round(height) });
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const handleUpdateConfig = (newConfig: Partial<Record<string, any>>) => {
    updateWidgetConfig(instanceId, newConfig);
  };

  const context: WidgetContext = {
    instanceId,
    config,
    updateConfig: handleUpdateConfig,
    storage,
    agentClient: defaultAgentClient,
    dimensions,
  };

  const WidgetComponent = widgetDef.component;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(51, 65, 85, 0.7)',
        borderRadius: '12px',
        boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {/* Header / Titlebar */}
      <div
        className="widget-drag-handle"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          background: 'rgba(30, 41, 59, 0.6)',
          borderBottom: '1px solid rgba(51, 65, 85, 0.5)',
          cursor: 'grab',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <GripHorizontal size={14} color="#64748b" />
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#f1f5f9' }}>
            {widgetDef.manifest.name}
          </span>
        </div>

        <button
          onClick={onRemove}
          title="Remover widget"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#64748b',
            cursor: 'pointer',
            padding: '2px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'color 0.2s, background 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#ef4444';
            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#64748b';
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          padding: '12px',
          overflow: 'auto',
          boxSizing: 'border-box',
        }}
      >
        <WidgetComponent context={context} />
      </div>
    </div>
  );
};
