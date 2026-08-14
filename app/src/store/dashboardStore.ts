import { create } from 'zustand';
import { Layout } from 'react-grid-layout';
import { WidgetDefinition } from '../sdk/types';
import { db } from '../sdk/storage';
import { ProfileAppearance, ProfileWidgetInstance, ProfileManifest } from '../types/profile';

interface DashboardState {
  registeredWidgets: Map<string, WidgetDefinition>;
  activeInstances: ProfileWidgetInstance[];
  isLoaded: boolean;
  theme: ProfileAppearance['theme'];
  density: ProfileAppearance['density'];
  accentColor: ProfileAppearance['accentColor'];

  registerWidget: (widget: WidgetDefinition) => void;
  loadProfile: () => void;
  saveProfile: () => void;
  addWidgetToCanvas: (widgetId: string) => void;
  removeWidgetFromCanvas: (instanceId: string) => void;
  toggleLockWidget: (instanceId: string) => void;
  reorganizeLayouts: () => void;
  updateLayout: (layouts: Layout[]) => void;
  updateWidgetConfig: (instanceId: string, newConfig: Record<string, any>) => void;
  setWidgetColorPreset: (instanceId: string, colorPreset: string) => void;
  setAppearance: (appearance: Partial<ProfileAppearance>) => void;
  resetDashboard: () => void;
}

const STORAGE_KEY = 'dashboard_profile_v1';
const DEFAULT_APPEARANCE: ProfileAppearance = {
  theme: 'dark',
  density: 'comfortable',
  accentColor: 'sky',
};

// Grid columns constant (must match Canvas.tsx)
const GRID_COLS = 12;

/**
 * Finds the first available (x, y) position for a new widget of size (w, h)
 * using a top-left scanning algorithm over the existing grid occupancy.
 */
function findFirstAvailablePosition(
  instances: ProfileWidgetInstance[],
  w: number,
  h: number
): { x: number; y: number } {
  if (instances.length === 0) return { x: 0, y: 0 };

  // Build a simple occupancy map: Set of "x,y" strings that are occupied
  const occupied = new Set<string>();
  for (const inst of instances) {
    const { x, y, w: iw, h: ih } = inst.layout;
    for (let row = y; row < y + ih; row++) {
      for (let col = x; col < x + iw; col++) {
        occupied.add(`${col},${row}`);
      }
    }
  }

  // Max row to search (below all current widgets)
  const maxRow = instances.reduce((max, i) => Math.max(max, i.layout.y + i.layout.h), 0);
  const searchRows = maxRow + h + 1;

  for (let row = 0; row < searchRows; row++) {
    for (let col = 0; col <= GRID_COLS - w; col++) {
      // Check if the w×h block starting at (col, row) is free
      let fits = true;
      outer: for (let dr = 0; dr < h; dr++) {
        for (let dc = 0; dc < w; dc++) {
          if (occupied.has(`${col + dc},${row + dr}`)) {
            fits = false;
            break outer;
          }
        }
      }
      if (fits) return { x: col, y: row };
    }
  }

  // Fallback: place below all existing widgets
  return { x: 0, y: maxRow };
}

function reorganizeInstancesLayout(instances: ProfileWidgetInstance[]): ProfileWidgetInstance[] {
  const fixedInstances = instances.filter((item) => item.isLocked);
  const placed: ProfileWidgetInstance[] = fixedInstances.map((item) => ({ ...item }));
  const updated: ProfileWidgetInstance[] = [];

  for (const instance of instances) {
    if (instance.isLocked) {
      updated.push(instance);
      continue;
    }

    const { x, y } = findFirstAvailablePosition(placed, instance.layout.w, instance.layout.h);
    const nextInstance: ProfileWidgetInstance = {
      ...instance,
      layout: {
        ...instance.layout,
        x,
        y,
        i: instance.instanceId,
      },
    };

    placed.push(nextInstance);
    updated.push(nextInstance);
  }

  return updated;
}

function normalizeAppearance(value: unknown): ProfileAppearance {
  if (typeof value === 'object' && value !== null) {
    const candidate = value as Partial<ProfileAppearance>;
    return {
      theme: candidate.theme === 'light' ? 'light' : 'dark',
      density: candidate.density === 'compact' ? 'compact' : 'comfortable',
      accentColor: candidate.accentColor === 'violet' || candidate.accentColor === 'emerald' ? candidate.accentColor : 'sky',
    };
  }
  return DEFAULT_APPEARANCE;
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  registeredWidgets: new Map(),
  activeInstances: [],
  isLoaded: false,
  theme: DEFAULT_APPEARANCE.theme,
  density: DEFAULT_APPEARANCE.density,
  accentColor: DEFAULT_APPEARANCE.accentColor,

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
        const appearance = normalizeAppearance(manifest.appearance);
        set({
          activeInstances: manifest.widgets || [],
          isLoaded: true,
          theme: appearance.theme,
          density: appearance.density,
          accentColor: appearance.accentColor,
        });
        return;
      }
    } catch (e) {
      console.error('[DashboardStore] Erro ao carregar perfil:', e);
    }
    set({ activeInstances: [], isLoaded: true, theme: DEFAULT_APPEARANCE.theme, density: DEFAULT_APPEARANCE.density, accentColor: DEFAULT_APPEARANCE.accentColor });
  },

  saveProfile: () => {
    const { activeInstances, theme, density, accentColor } = get();
    const manifest: ProfileManifest = {
      schemaVersion: 1,
      name: 'Meu Dashboard',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      appearance: { theme, density, accentColor },
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

    // Intelligent tiling: find first free position top-left scanning
    const { x, y } = findFirstAvailablePosition(activeInstances, defaultSize.w, defaultSize.h);

    const newInstance: ProfileWidgetInstance = {
      instanceId,
      widgetId,
      isLocked: false,
      layout: {
        i: instanceId,
        x,
        y,
        w: defaultSize.w,
        h: defaultSize.h,
      },
      config: {},
    };

    const nextInstances = [...activeInstances, newInstance];
    set({ activeInstances: nextInstances });
    saveProfile();

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('dashboard:focus-widget', { detail: { instanceId } })
      );
    }
  },

  removeWidgetFromCanvas: (instanceId: string) => {
    set((state) => ({
      activeInstances: state.activeInstances.filter((item) => item.instanceId !== instanceId),
    }));
    get().saveProfile();
  },

  toggleLockWidget: (instanceId: string) => {
    set((state) => ({
      activeInstances: state.activeInstances.map((item) =>
        item.instanceId === instanceId
          ? { ...item, isLocked: !item.isLocked }
          : item
      ),
    }));
    get().saveProfile();
  },

  reorganizeLayouts: () => {
    const { activeInstances, saveProfile } = get();
    const updated = reorganizeInstancesLayout(activeInstances);
    set({ activeInstances: updated });
    saveProfile();
  },

  updateLayout: (layouts: Layout[]) => {
    set((state) => {
      const layoutMap = new Map(layouts.map((l) => [l.i, l]));
      let hasChanges = false;

      const updatedInstances = state.activeInstances.map((instance) => {
        // Skip layout updates for locked widgets
        if (instance.isLocked) return instance;

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

  setWidgetColorPreset: (instanceId: string, colorPreset: string) => {
    set((state) => ({
      activeInstances: state.activeInstances.map((item) =>
        item.instanceId === instanceId
          ? { ...item, colorPreset }
          : item
      ),
    }));
    get().saveProfile();
  },

  setAppearance: (appearance) => {
    set((state) => ({
      ...state,
      ...appearance,
    }));
    get().saveProfile();
  },

  resetDashboard: () => {
    set({
      activeInstances: [],
      isLoaded: true,
      theme: DEFAULT_APPEARANCE.theme,
      density: DEFAULT_APPEARANCE.density,
      accentColor: DEFAULT_APPEARANCE.accentColor,
    });
    get().saveProfile();

    try {
      localStorage.removeItem(STORAGE_KEY);
      void db.kvStore.clear();
    } catch (e) {
      console.error('[DashboardStore] Erro ao resetar dashboard:', e);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('dashboard:reset'));
    }
  },
}));
