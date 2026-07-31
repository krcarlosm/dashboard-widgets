import React, { useEffect, useRef, useState } from 'react';
import { WidgetDefinition, WidgetContext } from '../sdk/types';
import { ScopedWidgetStorage } from '../sdk/storage';
import { defaultAgentClient } from '../sdk/agentClient';
import { useDashboardStore } from '../store/dashboardStore';
import { X, GripHorizontal, Wrench, AlertTriangle, Lock, Unlock } from 'lucide-react';

interface WidgetContainerProps {
  instanceId: string;
  widgetDef: WidgetDefinition;
  config: Record<string, any>;
  isLocked?: boolean;
  onRemove: () => void;
  onToggleLock: () => void;
}

export const WidgetContainer: React.FC<WidgetContainerProps> = ({
  instanceId,
  widgetDef,
  config,
  isLocked = false,
  onRemove,
  onToggleLock,
}) => {
  const updateWidgetConfig = useDashboardStore((state) => state.updateWidgetConfig);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const storage = useRef(new ScopedWidgetStorage(instanceId)).current;

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

  // Lifecycle execution
  useEffect(() => {
    const lifecycle = widgetDef.lifecycle;
    if (lifecycle?.init) {
      lifecycle.init(context);
    }
    return () => {
      if (lifecycle?.destroy) {
        lifecycle.destroy();
      }
    };
  }, [widgetDef]);

  // Dimension tracking
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const roundedW = Math.round(width);
        const roundedH = Math.round(height);
        setDimensions((prev) => {
          if (prev.width === roundedW && prev.height === roundedH) return prev;
          return { width: roundedW, height: roundedH };
        });
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const WidgetComponent = widgetDef.component;
  const status = widgetDef.manifest.status || 'stable';
  const isInactive = status === 'in_development' || status === 'needs_improvement';

  // Shared button style helper
  const stopPropagation = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(12px)',
        border: isLocked
          ? '1px solid rgba(99, 102, 241, 0.5)'
          : '1px solid rgba(51, 65, 85, 0.7)',
        borderRadius: '12px',
        boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        overflow: 'hidden',
        boxSizing: 'border-box',
        position: 'relative',
      }}
    >
      {/* Titlebar / Drag Handle */}
      <div
        className="widget-drag-handle"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          background: isLocked
            ? 'rgba(49, 46, 129, 0.4)'
            : 'rgba(30, 41, 59, 0.6)',
          borderBottom: '1px solid rgba(51, 65, 85, 0.5)',
          cursor: isLocked ? 'default' : 'grab',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', pointerEvents: 'none' }}>
          <GripHorizontal size={14} color={isLocked ? '#6366f1' : '#64748b'} />
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#f1f5f9' }}>
            {widgetDef.manifest.name}
          </span>

          {status === 'in_development' && (
            <span
              title="Este widget está em desenvolvimento e desativado para interação."
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                fontSize: '10px',
                background: 'rgba(56, 189, 248, 0.2)',
                color: '#38bdf8',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                padding: '1px 6px',
                borderRadius: '4px',
              }}
            >
              <Wrench size={10} /> Em Dev
            </span>
          )}

          {status === 'needs_improvement' && (
            <span
              title="Este widget necessita de melhorias."
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                fontSize: '10px',
                background: 'rgba(245, 158, 11, 0.2)',
                color: '#f59e0b',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                padding: '1px 6px',
                borderRadius: '4px',
              }}
            >
              <AlertTriangle size={10} /> Ajustes
            </span>
          )}
        </div>

        {/* Titlebar Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {/* Lock / Unlock button */}
          <button
            onClick={onToggleLock}
            onMouseDown={stopPropagation}
            onTouchStart={stopPropagation}
            title={isLocked ? 'Desbloquear widget' : 'Bloquear widget na posição'}
            style={{
              background: 'transparent',
              border: 'none',
              color: isLocked ? '#6366f1' : '#64748b',
              cursor: 'pointer',
              padding: '2px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.2s, background 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#818cf8';
              e.currentTarget.style.background = 'rgba(99, 102, 241, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = isLocked ? '#6366f1' : '#64748b';
              e.currentTarget.style.background = 'transparent';
            }}
          >
            {isLocked ? <Lock size={13} /> : <Unlock size={13} />}
          </button>

          {/* Close button — hidden when locked */}
          {!isLocked && (
            <button
              onClick={onRemove}
              onMouseDown={stopPropagation}
              onTouchStart={stopPropagation}
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
          )}
        </div>
      </div>

      {/* Widget Body */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          padding: '12px',
          overflow: 'auto',
          boxSizing: 'border-box',
          position: 'relative',
          opacity: isInactive ? 0.6 : 1,
          pointerEvents: isInactive ? 'none' : 'auto',
        }}
      >
        <WidgetComponent context={context} />
      </div>
    </div>
  );
};
