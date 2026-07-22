import { create } from 'zustand';
import { Layout } from 'react-grid-layout';
import { WidgetDefinition } from '../sdk/types';
import { ProfileWidgetInstance, ProfileManifest } from '../types/profile';

interface DashboardState {
  registeredWidgets: Map<string, WidgetDefinition>;
  activeInstances: ProfileWidgetInstance[];
  isLoaded: boolean;

  registerWidget: (widget: WidgetDefinition) => void;
  loadProfile: () => void;
  saveProfile: () => void;
  addWidgetToCanvas: (widgetId: string) => void;
  removeWidgetFromCanvas: (instanceId: string) => void;
  updateLayout: (layouts: Layout[]) => void;
  updateWidgetConfig: (instanceId: string, newConfig: Record<string, any>) => void;
}

const STORAGE_KEY = 'dashboard_profile_v1';

export const useDashboardStore = create<DashboardState>((set, get) => ({
  registeredWidgets: new Map(),
  activeInstances: [],
  isLoaded: false,

  registerWidget: (widget) => {
    set((state) => {
      const nextMap = new Map(state.registeredWidgets);
      nextMap.set(widget.manifest.id, widget);
      return { registeredWidgets: nextMap };
    });
  },

  loadProfile: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const manifest: ProfileManifest = JSON.parse(raw);
        set({ activeInstances: manifest.widgets || [], isLoaded: true });
        return;
      }
    } catch (e) {
      console.error('[DashboardStore] Erro ao carregar perfil:', e);
    }
    set({ activeInstances: [], isLoaded: true });
  },

  saveProfile: () => {
    const { activeInstances } = get();
    const manifest: ProfileManifest = {
      schemaVersion: 1,
      name: 'Meu Dashboard',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      widgets: activeInstances,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(manifest));
    } catch (e) {
      console.error('[DashboardStore] Erro ao salvar perfil:', e);
    }
  },

  addWidgetToCanvas: (widgetId: string) => {
    const { registeredWidgets, activeInstances, saveProfile } = get();
    const widgetDef = registeredWidgets.get(widgetId);
    if (!widgetDef) return;

    const instanceId = `${widgetId}-${Date.now()}`;
    const defaultSize = widgetDef.manifest.defaultSize;

    const maxY = activeInstances.reduce((max, item) => Math.max(max, item.layout.y + item.layout.h), 0);

    const newInstance: ProfileWidgetInstance = {
      instanceId,
      widgetId,
      layout: {
        i: instanceId,
        x: 0,
        y: maxY,
        w: defaultSize.w,
        h: defaultSize.h,
      },
      config: {},
    };

    set({ activeInstances: [...activeInstances, newInstance] });
    saveProfile();
  },

  removeWidgetFromCanvas: (instanceId: string) => {
    set((state) => ({
      activeInstances: state.activeInstances.filter((item) => item.instanceId !== instanceId),
    }));
    get().saveProfile();
  },

  updateLayout: (layouts: Layout[]) => {
    set((state) => {
      const layoutMap = new Map(layouts.map((l) => [l.i, l]));
      let hasChanges = false;

      const updatedInstances = state.activeInstances.map((instance) => {
        const newLayout = layoutMap.get(instance.instanceId);
        if (newLayout) {
          if (
            instance.layout.x !== newLayout.x ||
            instance.layout.y !== newLayout.y ||
            instance.layout.w !== newLayout.w ||
            instance.layout.h !== newLayout.h
          ) {
            hasChanges = true;
            return {
              ...instance,
              layout: {
                i: instance.instanceId,
                x: newLayout.x,
                y: newLayout.y,
                w: newLayout.w,
                h: newLayout.h,
              },
            };
          }
        }
        return instance;
      });

      if (!hasChanges) return state;
      return { activeInstances: updatedInstances };
    });
    get().saveProfile();
  },

  updateWidgetConfig: (instanceId: string, newConfig: Record<string, any>) => {
    set((state) => ({
      activeInstances: state.activeInstances.map((item) =>
        item.instanceId === instanceId
          ? { ...item, config: { ...item.config, ...newConfig } }
          : item
      ),
    }));
    get().saveProfile();
  },
}));
