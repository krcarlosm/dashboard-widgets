import React from 'react';
import { render } from '@testing-library/react';
import { vi } from 'vitest';
import type { AgentClientProtocol, AgentMessage, UploadOptions, WidgetContext, WidgetDefinition, WidgetStorage } from '../sdk/types';

// ─────────────────────────────────────────────────────────────────────────────
// Ferramentas para testar widgets isoladamente:
//  • MemoryStorage: o mesmo contrato do context.storage, em memória.
//  • FakeAgentClient: agente controlável (conectar/desconectar, emitir eventos,
//    responder rotas HTTP).
//  • renderWidget: monta o componente com um contexto completo e permite
//    "recarregar" o widget reaproveitando o mesmo storage.
// ─────────────────────────────────────────────────────────────────────────────

export class MemoryStorage implements WidgetStorage {
  data = new Map<string, any>();

  async get<T = any>(key: string, defaultValue?: T): Promise<T | undefined> {
    return this.data.has(key) ? structuredClone(this.data.get(key)) : defaultValue;
  }

  async set<T = any>(key: string, value: T): Promise<void> {
    this.data.set(key, structuredClone(value));
  }

  async remove(key: string): Promise<void> {
    this.data.delete(key);
  }

  async clear(): Promise<void> {
    this.data.clear();
  }
}

type RouteHandler = (options: RequestInit & { path: string }) => any;

export class FakeAgentClient implements AgentClientProtocol {
  isConnected: boolean;
  sent: AgentMessage[] = [];
  requests: { path: string; method: string; body?: any }[] = [];
  private subscribers = new Map<string, Set<(payload: any) => void>>();
  private statusListeners = new Set<(connected: boolean) => void>();
  private routes: { method: string; match: string | RegExp; handler: RouteHandler }[] = [];

  constructor(connected = true) {
    this.isConnected = connected;
  }

  /** Registra a resposta de uma rota HTTP do agente (a mais recente vence). Lançar um Error simula falha. */
  route(method: string, match: string | RegExp, handler: RouteHandler): this;
  route(method: string, match: string | RegExp, response: object): this;
  route(method: string, match: string | RegExp, handler: RouteHandler | object): this {
    this.routes.push({ method, match, handler: typeof handler === 'function' ? (handler as RouteHandler) : () => handler });
    return this;
  }

  setConnected(connected: boolean) {
    this.isConnected = connected;
    this.statusListeners.forEach((listener) => listener(connected));
  }

  emit(type: string, payload?: any) {
    this.subscribers.get(type)?.forEach((callback) => callback(payload));
  }

  disconnect() {
    this.setConnected(false);
  }

  send(message: AgentMessage) {
    this.sent.push(message);
  }

  subscribe(eventType: string, callback: (payload: any) => void) {
    if (!this.subscribers.has(eventType)) this.subscribers.set(eventType, new Set());
    this.subscribers.get(eventType)!.add(callback);
    return () => {
      this.subscribers.get(eventType)?.delete(callback);
    };
  }

  onStatusChange(listener: (connected: boolean) => void) {
    this.statusListeners.add(listener);
    listener(this.isConnected);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  async checkHealth() {
    return this.isConnected;
  }

  async requestJson<T = any>(path: string, options: RequestInit = {}): Promise<T> {
    const method = (options.method || 'GET').toUpperCase();
    const body = typeof options.body === 'string' ? JSON.parse(options.body) : undefined;
    this.requests.push({ path, method, body });
    return this.respond<T>(method, path, options);
  }

  private async respond<T>(method: string, path: string, options: RequestInit): Promise<T> {
    const route = [...this.routes].reverse().find(
      (entry) => entry.method === method && (typeof entry.match === 'string' ? path.split('?')[0] === entry.match : entry.match.test(path)),
    );
    if (!route) throw new Error(`Rota não simulada: ${method} ${path}`);
    return structuredClone(await route.handler({ ...options, path }));
  }

  private uploadHold: Promise<void> | null = null;

  /** Segura os próximos envios em 50% até chamar a função devolvida (para testar progresso e cancelamento). */
  holdUploads(): () => void {
    let release = () => {};
    this.uploadHold = new Promise<void>((resolve) => (release = resolve));
    return () => {
      this.uploadHold = null;
      release();
    };
  }

  async upload<T = any>(path: string, body: Blob, options: UploadOptions = {}): Promise<T> {
    this.requests.push({ path, method: 'POST', body: { file: (body as File).name, size: body.size } });
    options.onProgress?.(0.5);
    if (this.uploadHold) {
      await Promise.race([
        this.uploadHold,
        new Promise((_, reject) =>
          options.signal?.addEventListener('abort', () => reject(new DOMException('Envio cancelado', 'AbortError'))),
        ),
      ]);
    }
    options.onProgress?.(1);
    return this.respond<T>('POST', path, { method: 'POST' });
  }

  async requestBlob(path: string): Promise<Blob> {
    this.requests.push({ path, method: 'GET' });
    return new Blob(['png'], { type: 'image/png' });
  }

  saveBackup = vi.fn(async () => ({ path: '/tmp/backup.json', directory: '/tmp' }));
  openBackupDirectory = vi.fn(async () => ({ directory: '/tmp' }));
}

interface RenderOptions<TConfig> {
  config?: TConfig;
  storage?: MemoryStorage;
  agent?: FakeAgentClient;
  width?: number;
  height?: number;
  instanceId?: string;
}

export function renderWidget<TConfig extends Record<string, any> = Record<string, any>>(
  definition: WidgetDefinition<TConfig>,
  options: RenderOptions<TConfig> = {},
) {
  const storage = options.storage ?? new MemoryStorage();
  const agent = options.agent ?? new FakeAgentClient(false);
  let config = (options.config ?? {}) as TConfig;
  const updateConfig = vi.fn((patch: Partial<TConfig>) => {
    config = { ...config, ...patch };
    result.rerender(element());
  });

  const element = () => {
    const context: WidgetContext<TConfig> = {
      instanceId: options.instanceId ?? 'teste-1',
      config,
      updateConfig,
      storage,
      agentClient: agent,
      dimensions: { width: options.width ?? 480, height: options.height ?? 360 },
    };
    const Component = definition.component;
    return <Component context={context} />;
  };

  const result = render(element());
  return {
    ...result,
    storage,
    agent,
    updateConfig,
    getConfig: () => config,
    /** Desmonta e monta de novo com o mesmo storage (simula recarregar a página). */
    reload() {
      result.unmount();
      return renderWidget(definition, { ...options, storage, agent, config });
    },
  };
}
