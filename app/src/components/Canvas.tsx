import React from 'react';
import RGL, { WidthProvider } from 'react-grid-layout';
// @ts-ignore - allow importing CSS side-effect in this project without type declarations
import 'react-grid-layout/css/styles.css';
// @ts-ignore - allow importing CSS side-effect in this project without type declarations
import 'react-resizable/css/styles.css';
import { useDashboardStore } from '../store/dashboardStore';
import { WidgetContainer } from './WidgetContainer';

const ReactGridLayout = WidthProvider(RGL);

export const Canvas: React.FC = () => {
  const activeInstances = useDashboardStore((state) => state.activeInstances);
  const registeredWidgets = useDashboardStore((state) => state.registeredWidgets);
  const updateLayout = useDashboardStore((state) => state.updateLayout);
  const removeWidgetFromCanvas = useDashboardStore((state) => state.removeWidgetFromCanvas);
  const toggleLockWidget = useDashboardStore((state) => state.toggleLockWidget);

  return (
    <main
      style={{
        flex: 1,
        height: '100vh',
        overflowY: 'auto',
        padding: '20px',
        boxSizing: 'border-box',
        background: 'radial-gradient(circle at 50% 0%, #1e293b 0%, #0f172a 100%)',
      }}
    >
      {activeInstances.length === 0 ? (
        <div
          style={{
            height: 'calc(100vh - 40px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px dashed rgba(51, 65, 85, 0.4)',
            borderRadius: '16px',
            color: '#64748b',
            gap: '8px',
          }}
        >
          <span style={{ fontSize: '15px', fontWeight: 500 }}>Canvas Limpo</span>
          <span style={{ fontSize: '12px', color: '#475569' }}>
            Selecione um widget na barra lateral à esquerda para adicionar ao seu dashboard.
          </span>
        </div>
      ) : (
        <ReactGridLayout
          className="layout"
          cols={12}
          rowHeight={80}
          draggableHandle=".widget-drag-handle"
          onLayoutChange={updateLayout}
          isDraggable={true}
          isResizable={true}
          useCSSTransforms={false}
          isBounded={false}
          compactType={null}
          margin={[16, 16]}
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
                data-grid={{
                  x: instance.layout.x,
                  y: instance.layout.y,
                  w: instance.layout.w,
                  h: instance.layout.h,
                  minW: minSize.w,
                  minH: minSize.h,
                  maxW: maxSize.w,
                  maxH: maxSize.h,
                  // Disable drag & resize for locked widgets
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
