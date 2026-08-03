export interface ProfileWidgetLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  i: string; // instanceId para react-grid-layout
}

export interface ProfileWidgetInstance {
  instanceId: string;
  widgetId: string;
  isLocked?: boolean;
  layout: ProfileWidgetLayout;
  config: Record<string, any>;
}

export interface ProfileAppearance {
  theme: 'dark' | 'light';
  density: 'comfortable' | 'compact';
  accentColor: 'sky' | 'violet' | 'emerald';
}

export interface ProfileManifest {
  schemaVersion: number; // Atual: 1
  name?: string;
  createdAt: string;
  updatedAt: string;
  appearance?: ProfileAppearance;
  widgets: ProfileWidgetInstance[];
}
