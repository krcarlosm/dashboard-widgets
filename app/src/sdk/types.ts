import React from 'react';

export interface WidgetDimensions {
  w: number; // Colunas no grid (ex: 1 a 12)
  h: number; // Linhas no grid
}

export interface WidgetManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  icon: string; // Nome do ícone Lucide
  author?: string;
  status?: 'stable' | 'in_development' | 'needs_improvement' | 'deprecated';
  defaultSize: WidgetDimensions;
  minSize: WidgetDimensions;
  maxSize: WidgetDimensions;
  requiresAgent?: boolean;
}

export interface WidgetStorage {
  get<T = any>(key: string, defaultValue?: T): Promise<T | undefined>;
  set<T = any>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
}

export interface AgentMessage {
  type: string;
  payload?: any;
}

export interface AgentClientProtocol {
  isConnected: boolean;
  send(message: AgentMessage): void;
  subscribe(eventType: string, callback: (payload: any) => void): () => void;
  checkHealth(): Promise<boolean>;
}

export interface WidgetContext<TConfig = Record<string, any>> {
  instanceId: string;
  config: TConfig;
  updateConfig: (newConfig: Partial<TConfig>) => void;
  storage: WidgetStorage;
  agentClient: AgentClientProtocol;
  dimensions: { width: number; height: number };
}

export interface WidgetLifecycle {
  init?(context: WidgetContext): Promise<void> | void;
  getConfig?(): Record<string, any>;
  getExportableDefaults?(): Record<string, any>;
  getUserData?(): Promise<Record<string, any>> | Record<string, any>;
  onResize?(dimensions: { width: number; height: number }): void;
  destroy?(): void;
}

export type WidgetComponentProps<TConfig = Record<string, any>> = {
  context: WidgetContext<TConfig>;
};

export interface WidgetDefinition<TConfig = Record<string, any>> {
  manifest: WidgetManifest;
  component: React.ComponentType<WidgetComponentProps<TConfig>>;
  lifecycle?: WidgetLifecycle;
}
