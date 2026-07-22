import React from 'react';
import RGL, { WidthProvider, Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { useDashboardStore } from '../store/dashboardStore';
import { WidgetContainer } from './WidgetContainer';

const ReactGridLayout = WidthProvider(RGL);

export const Canvas: React.FC = () => {
  const activeInstances = useDashboardStore((state) => state.activeInstances);
  const registeredWidgets = useDashboardStore((state) => state.registeredWidgets);
  const updateLayout = useDashboardStore((state) => state.updateLayout);
  const removeWidgetFromCanvas = useDashboardStore((state) => state.removeWidgetFromCanvas);

  const layout: Layout[] = activeInstances.map((item) => {
    const widgetDef = registeredWidgets.get(item.widgetId);
    const minSize = widgetDef?.manifest.minSize || { w: 2, h: 2 };
    const maxSize = widgetDef?.manifest.maxSize || { w: 12, h: 12 };

    return {
      i: item.instanceId,
      x: item.layout.x,
      y: item.layout.y,
      w: item.layout.w,
      h: item.layout.h,
      minW: minSize.w,
      minH: minSize.h,
      maxW: maxSize.w,
      maxH: maxSize.h,
    };
  });

  const handleLayoutChange = (newLayout: Layout[]) => {
    updateLayout(newLayout);
  };

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
          layout={layout}
          cols={12}
          rowHeight={80}
          draggableHandle=".widget-drag-handle"
          onDragStop={handleLayoutChange}
          onResizeStop={handleLayoutChange}
          isDraggable={true}
          isResizable={true}
          isBounded={false}
          compactType="vertical"
          margin={[16, 16]}
        >
          {activeInstances.map((instance) => {
            const widgetDef = registeredWidgets.get(instance.widgetId);
            if (!widgetDef) return <div key={instance.instanceId} />;

            return (
              <div key={instance.instanceId} style={{ height: '100%' }}>
                <WidgetContainer
                  instanceId={instance.instanceId}
                  widgetDef={widgetDef}
                  config={instance.config}
                  onRemove={() => removeWidgetFromCanvas(instance.instanceId)}
                />
              </div>
            );
          })}
        </ReactGridLayout>
      )}
    </main>
  );
};
