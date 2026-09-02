import React, { useEffect, useRef, useState } from 'react';
import { WidgetDefinition, WidgetContext } from '../sdk/types';
import { ScopedWidgetStorage } from '../sdk/storage';
import { defaultAgentClient } from '../sdk/agentClient';
import { useDashboardStore } from '../store/dashboardStore';
import { X, GripHorizontal, Wrench, AlertTriangle, Lock, Unlock, Palette, Pencil } from 'lucide-react';

export const COLOR_PRESETS: Record<string, { label: string; bg: string; border: string; accent: string }> = {
  default: { label: 'Padrão Slate', bg: 'rgba(30, 41, 59, 0.6)', border: 'rgba(51, 65, 85, 0.7)', accent: '#64748b' },
  sky: { label: 'Azul Sky', bg: 'rgba(2, 132, 199, 0.18)', border: 'rgba(56, 189, 248, 0.5)', accent: '#38bdf8' },
  emerald: { label: 'Verde Esmeralda', bg: 'rgba(5, 150, 105, 0.18)', border: 'rgba(52, 211, 153, 0.5)', accent: '#34d399' },
  violet: { label: 'Roxo Violeta', bg: 'rgba(124, 58, 237, 0.18)', border: 'rgba(167, 139, 250, 0.5)', accent: '#a78bfa' },
  amber: { label: 'Âmbar Dourado', bg: 'rgba(217, 119, 6, 0.18)', border: 'rgba(251, 191, 36, 0.5)', accent: '#fbbf24' },
  rose: { label: 'Rosa Rose', bg: 'rgba(225, 29, 72, 0.18)', border: 'rgba(251, 113, 133, 0.5)', accent: '#fb7185' },
  indigo: { label: 'Índigo Azul', bg: 'rgba(79, 70, 229, 0.18)', border: 'rgba(129, 140, 248, 0.5)', accent: '#818cf8' },
  teal: { label: 'Verde Teal', bg: 'rgba(13, 148, 136, 0.18)', border: 'rgba(45, 212, 191, 0.5)', accent: '#2dd4bf' },
  fuchsia: { label: 'Magenta Fuchsia', bg: 'rgba(192, 38, 211, 0.18)', border: 'rgba(232, 121, 249, 0.5)', accent: '#e879f9' },
  orange: { label: 'Laranja Sunset', bg: 'rgba(234, 88, 12, 0.18)', border: 'rgba(251, 146, 60, 0.5)', accent: '#fb923c' },
};

interface WidgetContainerProps {
  instanceId: string;
  widgetDef: WidgetDefinition;
  config: Record<string, any>;
  isLocked?: boolean;
  colorPreset?: string;
  onRemove: () => void;
  onToggleLock: () => void;
}

export const WidgetContainer: React.FC<WidgetContainerProps> = ({
  instanceId,
  widgetDef,
  config,
  isLocked = false,
  colorPreset = 'default',
  onRemove,
  onToggleLock,
}) => {
  const updateWidgetConfig = useDashboardStore((state) => state.updateWidgetConfig);
  const setWidgetColorPreset = useDashboardStore((state) => state.setWidgetColorPreset);
  const theme = useDashboardStore((state) => state.theme);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [showColorPicker, setShowColorPicker] = useState<boolean>(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  const storage = useRef(new ScopedWidgetStorage(instanceId)).current;
  const colorTheme = COLOR_PRESETS[colorPreset] || COLOR_PRESETS.default;

  const isLight = theme === 'light';
  const containerBg = colorPreset !== 'default'
    ? (isLight ? '#ffffff' : 'rgba(15, 23, 42, 0.85)')
    : (isLight ? 'rgba(255, 255, 255, 0.94)' : 'rgba(15, 23, 42, 0.85)');

  const titlebarBg = isLocked
    ? (isLight ? 'rgba(224, 231, 255, 0.8)' : 'rgba(49, 46, 129, 0.4)')
    : (colorPreset !== 'default' ? colorTheme.bg : (isLight ? 'rgba(241, 245, 249, 0.95)' : 'rgba(30, 41, 59, 0.6)'));

  const titleTextColor = isLight ? '#0f172a' : '#f1f5f9';
  const canRename = widgetDef.manifest.id === 'todo';
  const customTitle = typeof config.customTitle === 'string' ? config.customTitle.trim() : '';
  const displayTitle = canRename && customTitle ? customTitle : widgetDef.manifest.name;

  const handleUpdateConfig = (newConfig: Partial<Record<string, any>>) => {
    updateWidgetConfig(instanceId, newConfig);
  };

  const stopPropagation = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
  };

  const startTitleEditing = (event: React.MouseEvent) => {
    stopPropagation(event);
    setTitleDraft(customTitle || widgetDef.manifest.name);
    setIsEditingTitle(true);
  };

  const saveTitle = () => {
    handleUpdateConfig({ customTitle: titleDraft.trim().slice(0, 50) });
    setIsEditingTitle(false);
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

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: containerBg,
        backdropFilter: 'blur(12px)',
        border: isLocked
          ? '1px solid rgba(99, 102, 241, 0.5)'
          : `1px solid ${colorTheme.border}`,
        borderRadius: '12px',
        boxShadow: colorPreset !== 'default'
          ? `0 8px 32px 0 rgba(0, 0, 0, 0.4), 0 0 12px ${colorTheme.accent}20`
          : (isLight ? '0 8px 24px rgba(148, 163, 184, 0.25)' : '0 8px 32px 0 rgba(0, 0, 0, 0.37)'),
        overflow: 'hidden',
        boxSizing: 'border-box',
        position: 'relative',
        color: isLight ? '#0f172a' : '#f8fafc',
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
          background: titlebarBg,
          borderBottom: `1px solid ${colorTheme.border}`,
          cursor: isLocked ? 'default' : 'grab',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <GripHorizontal size={14} color={isLocked ? '#6366f1' : colorTheme.accent} />
          {isEditingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              maxLength={50}
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={saveTitle}
              onKeyDown={(event) => {
                if (event.key === 'Enter') saveTitle();
                if (event.key === 'Escape') setIsEditingTitle(false);
              }}
              onMouseDown={stopPropagation}
              onTouchStart={stopPropagation}
              style={{ width: '150px', background: 'transparent', border: `1px solid ${colorTheme.accent}`, borderRadius: '4px', color: titleTextColor, padding: '2px 5px', fontSize: '12px', fontWeight: 600, outline: 'none' }}
            />
          ) : (
            <span title={displayTitle} style={{ fontSize: '12px', fontWeight: 600, color: titleTextColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {displayTitle}
            </span>
          )}
          {canRename && !isEditingTitle && (
            <button
              onClick={startTitleEditing}
              onMouseDown={stopPropagation}
              onTouchStart={stopPropagation}
              title="Editar título"
              style={{ background: 'transparent', border: 'none', color: colorTheme.accent, cursor: 'pointer', padding: '2px', display: 'flex', flexShrink: 0 }}
            >
              <Pencil size={12} />
            </button>
          )}

          {status === 'in_development' && (
            <span
              title="Este widget está em desenvolvimento e desativado para interação."
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                fontSize: '10px',
                background: 'var(--app-accent-soft)',
                color: 'var(--app-accent)',
                border: '1px solid var(--app-accent-border)',
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '8px', position: 'relative' }}>
          {/* Color palette picker button */}
          <button
            onClick={(e) => {
              stopPropagation(e);
              setShowColorPicker(!showColorPicker);
            }}
            onMouseDown={stopPropagation}
            onTouchStart={stopPropagation}
            title="Escolher cor da instância"
            style={{
              background: showColorPicker ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
              border: 'none',
              color: colorTheme.accent,
              cursor: 'pointer',
              padding: '3px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
            }}
          >
            <Palette size={13} />
          </button>

          {/* Color Swatches Popover */}
          {showColorPicker && (
            <div
              onMouseDown={stopPropagation}
              onTouchStart={stopPropagation}
              style={{
                position: 'absolute',
                top: '26px',
                right: '0',
                zIndex: 999,
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '8px',
                padding: '8px',
                boxShadow: '0 10px 25px rgba(0,0,0,0.6)',
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: '6px',
                width: '150px',
              }}
            >
              {Object.entries(COLOR_PRESETS).map(([key, item]) => (
                <button
                  key={key}
                  onClick={() => {
                    setWidgetColorPreset(instanceId, key);
                    setShowColorPicker(false);
                  }}
                  title={item.label}
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    background: item.accent,
                    border: colorPreset === key ? '2px solid #ffffff' : '1px solid transparent',
                    cursor: 'pointer',
                    boxShadow: colorPreset === key ? '0 0 8px ' + item.accent : 'none',
                    transition: 'transform 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.15)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                />
              ))}
            </div>
          )}

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
              padding: '3px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.2s, background 0.2s',
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
                padding: '3px',
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

