# 1. Atualização do `themeGradients.ts`

Vamos substituir o `0%` estático da posição do círculo por uma variável CSS chamada `var(--focal-y, 0%)`. Assim, o React pode injetar o valor dinâmico sem precisar recriar a string do gradiente a todo momento.

Substitua o conteúdo do `themeGradients.ts`:

```typescript
export type ThemeType = 'light' | 'dark';

export type CanvasPreset =
  | 'default'
  | 'ocean'
  | 'sunset'
  | 'midnight'
  | 'drakula'
  | 'batman'
  | 'superman'
  | 'greenlantern'
  | 'whiteMarble'
  | 'blackMarble'
  | 'noir'
  | 'azul'
  | 'violeta'
  | 'esmeralda'
  | 'rosa'
  | 'ambar'
  | 'indigo'
  | 'fearOfTheDark';

export const backgroundMap: Record<CanvasPreset, Record<ThemeType, string>> = {
  default: {
    light: 'radial-gradient(circle at 50% var(--focal-y, 0%), #ffffff 0%, #f1f5f9 40%, #cbd5e1 100%)',
    dark: 'radial-gradient(circle at 50% var(--focal-y, 0%), #334155 0%, #1e293b 40%, #0f172a 100%)',
  },
  ocean: {
    light: 'radial-gradient(circle at 50% var(--focal-y, 0%), #f0f9ff 0%, #e0f2fe 40%, #7dd3fc 100%)',
    dark: 'radial-gradient(circle at 50% var(--focal-y, 0%), #0284c7 0%, #0c4a6e 40%, #082f49 100%)',
  },
  sunset: {
    light: 'radial-gradient(circle at 50% var(--focal-y, 0%), #fef3c7 0%, #fed7aa 40%, #f97316 100%)',
    dark: 'radial-gradient(circle at 50% var(--focal-y, 0%), #ea580c 0%, #7c2d12 40%, #2a0800 100%)',
  },
  midnight: {
    light: 'radial-gradient(circle at 50% var(--focal-y, 0%), #fdf4ff 0%, #f3e8ff 40%, #c084fc 100%)',
    dark: 'radial-gradient(circle at 50% var(--focal-y, 0%), #7e22ce 0%, #4c1d95 40%, #170535 100%)',
  },
  drakula: {
    light: 'radial-gradient(circle at 50% var(--focal-y, 0%), #ffffff 0%, #f8f8f2 40%, #d6d6c2 100%)',
    dark: 'radial-gradient(circle at 50% var(--focal-y, 0%), #6272a4 0%, #282a36 40%, #191a21 100%)',
  },
  batman: {
    light: 'radial-gradient(circle at 50% var(--focal-y, 0%), #f3f4f6 0%, #9ca3af 40%, #4b5563 100%)',
    dark: 'radial-gradient(circle at 50% var(--focal-y, 0%), #374151 0%, #111827 40%, #000000 100%)',
  },
  superman: {
    light: 'radial-gradient(circle at 50% var(--focal-y, 0%), #eff6ff 0%, #93c5fd 50%, #ef4444 100%)',
    dark: 'radial-gradient(circle at 50% var(--focal-y, 0%), #1d4ed8 0%, #1e3a8a 40%, #7f1d1d 100%)',
  },
  greenlantern: {
    light: 'radial-gradient(circle at 50% var(--focal-y, 0%), #f0fdf4 0%, #86efac 40%, #22c55e 100%)',
    dark: 'radial-gradient(circle at 50% var(--focal-y, 0%), #16a34a 0%, #14532d 40%, #052e16 100%)',
  },
  whiteMarble: {
    light: 'radial-gradient(circle at 50% var(--focal-y, 0%), #ffffff 0%, #f3f4f6 50%, #d1d5db 100%)',
    dark: 'radial-gradient(circle at 50% var(--focal-y, 0%), #e5e7eb 0%, #9ca3af 40%, #4b5563 100%)',
  },
  blackMarble: {
    light: 'radial-gradient(circle at 50% var(--focal-y, 0%), #9ca3af 0%, #4b5563 50%, #1f2937 100%)',
    dark: 'radial-gradient(circle at 50% var(--focal-y, 0%), #4b5563 0%, #1f2937 40%, #000000 100%)',
  },
  noir: {
    light: 'radial-gradient(circle at 50% var(--focal-y, 0%), #f5f5f5 0%, #d4d4d4 40%, #737373 100%)',
    dark: 'radial-gradient(circle at 50% var(--focal-y, 0%), #525252 0%, #262626 40%, #0a0a0a 100%)',
  },
  azul: {
    light: 'radial-gradient(circle at 50% var(--focal-y, 0%), #e0f2fe 0%, #38bdf8 40%, #0284c7 100%)',
    dark: 'radial-gradient(circle at 50% var(--focal-y, 0%), #0284c7 0%, #0369a1 40%, #082f49 100%)',
  },
  violeta: {
    light: 'radial-gradient(circle at 50% var(--focal-y, 0%), #ede9fe 0%, #8b5cf6 40%, #7c3aed 100%)',
    dark: 'radial-gradient(circle at 50% var(--focal-y, 0%), #7c3aed 0%, #5b21b6 40%, #2e1065 100%)',
  },
  esmeralda: {
    light: 'radial-gradient(circle at 50% var(--focal-y, 0%), #d1fae5 0%, #34d399 40%, #059669 100%)',
    dark: 'radial-gradient(circle at 50% var(--focal-y, 0%), #059669 0%, #047857 40%, #022c22 100%)',
  },
  rosa: {
    light: 'radial-gradient(circle at 50% var(--focal-y, 0%), #ffe4e6 0%, #fb7185 40%, #e11d48 100%)',
    dark: 'radial-gradient(circle at 50% var(--focal-y, 0%), #e11d48 0%, #be123c 40%, #4c0519 100%)',
  },
  ambar: {
    light: 'radial-gradient(circle at 50% var(--focal-y, 0%), #fef3c7 0%, #fbbf24 40%, #d97706 100%)',
    dark: 'radial-gradient(circle at 50% var(--focal-y, 0%), #d97706 0%, #b45309 40%, #451a03 100%)',
  },
  indigo: {
    light: 'radial-gradient(circle at 50% var(--focal-y, 0%), #e0e7ff 0%, #818cf8 40%, #4f46e5 100%)',
    dark: 'radial-gradient(circle at 50% var(--focal-y, 0%), #4f46e5 0%, #4338ca 40%, #1e1b4b 100%)',
  },
  fearOfTheDark: {
    light: 'radial-gradient(circle at 50% var(--focal-y, 0%), #f1f5f9 0%, #cbd5e1 40%, #64748b 100%)',
    dark: 'radial-gradient(circle at 50% var(--focal-y, 0%), #334155 0%, #0f172a 40%, #020617 100%)',
  }
};
```

---

# 2. Atualização do `Canvas.tsx`

Adicionaremos um estado `focalY` e um hook para calcular a progressão do tempo.

```typescript
import React, { useEffect, useRef, useState } from 'react';
import RGL, { WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { useDashboardStore } from '../store/dashboardStore';
import { WidgetContainer } from './WidgetContainer';
import { backgroundMap, CanvasPreset } from './themeGradients';

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
  
  const activePreset: CanvasPreset = 'default';

  // ── ESTADO PARA O EFEITO DE PASSAGEM DO TEMPO ──
  const [focalY, setFocalY] = useState('0%');

  const rowHeight = density === 'compact' ? 60 : 80;
  const gridMargin: [number, number] = density === 'compact' ? [6, 6] : [12, 12];

  // ── LÓGICA DE CÁLCULO DA POSIÇÃO FOCAL ──
  useEffect(() => {
    const calculateFocalY = () => {
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes();
      
      const timeInMinutes = hours * 60 + minutes;
      const startMinutes = 7 * 60;  // 07:00
      const endMinutes = 17 * 60;   // 17:00
      
      // Antes das 7h, a luz está no topo (0%)
      if (timeInMinutes <= startMinutes) return '0%';
      // Depois das 17h, a luz está no fundo (100%)
      if (timeInMinutes >= endMinutes) return '100%';
      
      // Calcula a porcentagem do dia comercial que já passou
      const progress = ((timeInMinutes - startMinutes) / (endMinutes - startMinutes)) * 100;
      return `${progress.toFixed(2)}%`;
    };

    // Aplica imediatamente ao montar
    setFocalY(calculateFocalY());

    // Atualiza a cada 1 minuto (60000ms)
    const interval = setInterval(() => {
      setFocalY(calculateFocalY());
    }, 60000);

    return () => clearInterval(interval);
  }, []);

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
        // Injetamos a variável CSS dinâmica aqui (usando type assertion para o React aceitar custom properties)
        '--focal-y': focalY,
        scrollBehavior: 'smooth',
      } as React.CSSProperties}
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
```
