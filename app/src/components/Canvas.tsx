import React, { useEffect, useRef } from 'react';
import RGL, { WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { useDashboardStore } from '../store/dashboardStore';
import { WidgetContainer } from './WidgetContainer';
import { backgroundMap, CanvasPreset } from './themeGradients'; // Importa o mapa de gradientes

const ReactGridLayout = WidthProvider(RGL);

export const Canvas: React.FC = () => {
  const activeInstances = useDashboardStore((state) => state.activeInstances);
  const registeredWidgets = useDashboardStore((state) => state.registeredWidgets);
  const updateLayout = useDashboardStore((state) => state.updateLayout);
  const removeWidgetFromCanvas = useDashboardStore((state) => state.removeWidgetFromCanvas);
  const toggleLockWidget = useDashboardStore((state) => state.toggleLockWidget);
  const reorganizeLayouts = useDashboardStore((state) => state.reorganizeLayouts);

  const mainRef = useRef<HTMLElement>(null);
  const theme = useDashboardStore((state) => state.theme);
  const density = useDashboardStore((state) => state.density);

	// Como padrão para esta versão, definimos "default".
	// Futuramente, você pode puxar activePreset direto do seu Zustand (ex: state.activePreset)
	// -----------------------------------
	// Temas pré-definidos
	// 'default'
	// 'ocean'
	// 'sunset'
	// 'midnight'
	// 'drakula'
	// 'batman'
	// 'superman'
	// 'greenlantern'
	// 'whiteMarble'
	// 'blackMarble'
	// 'noir'
	// 'azul'
	// 'violeta'
	// 'esmeralda'
	// 'rosa'
	// 'ambar'
	// 'indigo'
	// 'fearOfTheDark'
	// -----------------------------------
  const activePreset: CanvasPreset = 'batman';

  const rowHeight = density === 'compact' ? 60 : 80;
  const gridMargin: [number, number] = density === 'compact' ? [6, 6] : [12, 12];

  useEffect(() => {
    const handleFocusWidget = (event: Event) => {
      const customEvent = event as CustomEvent<{ instanceId?: string }>;
      const instanceId = customEvent.detail?.instanceId;
      if (!instanceId) return;

      requestAnimationFrame(() => {
        const target = document.querySelector(`[data-widget-instance-id="${instanceId}"]`) as HTMLElement | null;
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        }
      });
    };

    const handleViewAll = () => {
      mainRef.current?.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    };

    window.addEventListener('dashboard:focus-widget', handleFocusWidget as EventListener);
    window.addEventListener('dashboard:view-all', handleViewAll as EventListener);

    return () => {
      window.removeEventListener('dashboard:focus-widget', handleFocusWidget as EventListener);
      window.removeEventListener('dashboard:view-all', handleViewAll as EventListener);
    };
  }, []);

  // Busca o gradiente baseado no tema ativo e adiciona um fallback seguro
  const currentBackground = backgroundMap[activePreset]?.[theme] || backgroundMap.default[theme];

  return (
    <main
      ref={mainRef}
      style={{
        flex: 1,
        height: '100vh',
        overflowY: 'auto',
        padding: density === 'compact' ? '5px' : '18px',
        boxSizing: 'border-box',
        background: currentBackground,
        scrollBehavior: 'smooth',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => reorganizeLayouts()}
            style={{
              background: 'var(--app-surface)',
              color: 'var(--app-text)',
              border: '1px solid var(--app-accent-border)',
              borderRadius: '8px',
              padding: '8px 12px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            Reorganizar
          </button>
          <button
            onClick={() => mainRef.current?.scrollTo({ top: 0, left: 0, behavior: 'smooth' })}
            style={{
              background: 'var(--app-surface)',
              color: 'var(--app-accent-strong)',
              border: '1px solid var(--app-accent-border)',
              borderRadius: '8px',
              padding: '8px 12px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            Ver tudo
          </button>
        </div>
      </div>

      {activeInstances.length === 0 ? (
        <div
          style={{
            height: 'calc(100vh - 40px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            border: `2px dashed ${theme === 'light' ? '#cbd5e1' : 'rgba(51, 65, 85, 0.4)'}`,
            borderRadius: '16px',
            color: theme === 'light' ? '#64748b' : '#64748b',
            gap: '8px',
          }}
        >
          <span style={{ fontSize: '15px', fontWeight: 500 }}>Canvas Limpo</span>
          <span style={{ fontSize: '12px', color: theme === 'light' ? '#64748b' : '#475569' }}>
            Selecione um widget na barra lateral à esquerda para adicionar ao seu dashboard.
          </span>
        </div>
      ) : (
        <ReactGridLayout
          className="layout"
          cols={12}
          rowHeight={rowHeight}
          draggableHandle=".widget-drag-handle"
          onLayoutChange={updateLayout}
          isDraggable={true}
          isResizable={true}
          useCSSTransforms={false}
          isBounded={false}
          compactType={null}
          margin={gridMargin}
        >
          {activeInstances.map((instance) => {
            const widgetDef = registeredWidgets.get(instance.widgetId);
            if (!widgetDef) return <div key={instance.instanceId} />;

            const minSize = widgetDef.manifest.minSize || { w: 2, h: 2 };
            const maxSize = widgetDef.manifest.maxSize || { w: 12, h: 12 };
            const isLocked = instance.isLocked ?? false;

            return (
              <div
                key={instance.instanceId}
                data-widget-instance-id={instance.instanceId}
                data-grid={{
                  x: instance.layout.x,
                  y: instance.layout.y,
                  w: instance.layout.w,
                  h: instance.layout.h,
                  minW: minSize.w,
                  minH: minSize.h,
                  maxW: maxSize.w,
                  maxH: maxSize.h,
                  isDraggable: !isLocked,
                  isResizable: !isLocked,
                  static: isLocked,
                }}
              >
                <WidgetContainer
                  instanceId={instance.instanceId}
                  widgetDef={widgetDef}
                  config={instance.config}
                  isLocked={isLocked}
                  colorPreset={instance.colorPreset}
                  onRemove={() => removeWidgetFromCanvas(instance.instanceId)}
                  onToggleLock={() => toggleLockWidget(instance.instanceId)}
                />
              </div>
            );
          })}
        </ReactGridLayout>
      )}
    </main>
  );
};