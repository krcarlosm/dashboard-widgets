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
  colorPreset?: string; // Cor individual da instância do widget (10 opções)
  layout: ProfileWidgetLayout;
  config: Record<string, any>;
}

export interface ProfileAppearance {
  theme: 'dark' | 'light';
  density: 'comfortable' | 'compact';
  accentColor: 'sky' | 'violet' | 'emerald' | 'rose' | 'amber' | 'indigo';
  canvasPreset: 'default' | 'ocean' | 'sunset' | 'midnight' | 'drakula' | 'batman' | 'superman' | 'greenlantern' | 'whiteMarble' | 'blackMarble' | 'noir' | 'azul' | 'violeta' | 'esmeralda' | 'rosa' | 'ambar' | 'indigo' | 'fearOfTheDark';
}

export interface ProfileManifest {
  schemaVersion: number; // Atual: 1
  name?: string;
  createdAt: string;
  updatedAt: string;
  appearance?: ProfileAppearance;
  widgets: ProfileWidgetInstance[];
}
