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
  layout: ProfileWidgetLayout;
  config: Record<string, any>;
}

export interface ProfileManifest {
  schemaVersion: number; // Atual: 1
  name?: string;
  createdAt: string;
  updatedAt: string;
  widgets: ProfileWidgetInstance[];
}
