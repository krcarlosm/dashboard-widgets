import { AgentClientProtocol, AgentMessage } from './types';

type EventCallback = (payload: any) => void;

const AGENT_TOKEN_KEY = 'dashboard-agent-token';
const DEFAULT_AGENT_PORT = 5137;
const DEFAULT_AGENT_WS_URL = (import.meta.env.VITE_AGENT_WS_URL as string) || `ws://127.0.0.1:${DEFAULT_AGENT_PORT}/ws`;
const DEFAULT_AGENT_HTTP_URL = (import.meta.env.VITE_AGENT_HTTP_URL as string) || `http://127.0.0.1:${DEFAULT_AGENT_PORT}`;

export class LocalAgentClient implements AgentClientProtocol {
  private ws: WebSocket | null = null;
  private url: string;
  private subscribers: Map<string, Set<EventCallback>> = new Map();
  private reconnectTimer: any = null;
  private shouldReconnect = true;
  public isConnected: boolean = false;
  private statusListeners: Set<(connected: boolean) => void> = new Set();
  private token: string | null = null;

  constructor(url: string = DEFAULT_AGENT_WS_URL) {
    this.url = url;
    this.connect();
  }

  public connect(): void {
    this.shouldReconnect = true;

    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        void this.performHandshake();
      };

      this.ws.onmessage = (event) => {
        try {
          const message: AgentMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (err) {
          console.error('[LocalAgentClient] Erro ao parsear mensagem:', err);
        }
      };

      this.ws.onclose = () => {
        if (this.isConnected) {
          console.log('[LocalAgentClient] Conexão com Agent encerrada.');
        }
        this.isConnected = false;
        this.notifyStatus(false);
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch {
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    }
  }

  public disconnect(): void {
    this.shouldReconnect = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.setConnected(false);
    this.ws?.close();
    this.ws = null;
  }

  private async performHandshake(): Promise<void> {
    const token = await this.loadToken();
    if (!token) {
      console.warn('[LocalAgentClient] Token do Agent não encontrado.');
      this.setConnected(false);
      return;
    }

    this.send({
      type: 'handshake',
      payload: {
        client: 'dashboard-ui',
        version: '0.1.0',
        token,
      },
    });
  }

  private async loadToken(): Promise<string | null> {
    if (this.token) return this.token;

    const cached = window.localStorage.getItem(AGENT_TOKEN_KEY);
    if (cached) {
      this.token = cached;
      return cached;
    }

    try {
      const response = await fetch(`${DEFAULT_AGENT_HTTP_URL}/auth/token`, { headers: { Accept: 'application/json' } });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = await response.json();
      const nextToken = typeof payload?.token === 'string' ? payload.token : null;
      if (nextToken) {
        this.token = nextToken;
        window.localStorage.setItem(AGENT_TOKEN_KEY, nextToken);
      }
      return nextToken;
    } catch (err) {
      console.warn('[LocalAgentClient] Não foi possível obter o token do Agent:', err);
      return null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }

  private handleMessage(message: AgentMessage): void {
    if (message.type === 'handshake:ack') {
      this.setConnected(true);
    } else if (message.type === 'handshake:rejected') {
      this.setConnected(false);
    }

    const callbacks = this.subscribers.get(message.type);
    if (callbacks) {
      callbacks.forEach((cb) => cb(message.payload));
    }
  }

  public send(message: AgentMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('[LocalAgentClient] Agent não está conectado. Mensagem não enviada:', message);
    }
  }

  public async checkHealth(): Promise<boolean> {
    const token = await this.loadToken();
    if (!token) {
      this.setConnected(false);
      return false;
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.connect();
    }

    return await new Promise<boolean>((resolve) => {
      const ackUnsubscribe = this.subscribe('handshake:ack', () => {
        ackUnsubscribe();
        rejectUnsubscribe();
        resolve(true);
      });

      const rejectUnsubscribe = this.subscribe('handshake:rejected', () => {
        ackUnsubscribe();
        rejectUnsubscribe();
        resolve(false);
      });

      const timeout = window.setTimeout(() => {
        ackUnsubscribe();
        rejectUnsubscribe();
        resolve(false);
      }, 2000);

      this.send({
        type: 'handshake',
        payload: {
          client: 'dashboard-ui',
          version: '0.1.0',
          token,
        },
      });

      window.setTimeout(() => window.clearTimeout(timeout), 0);
    });
  }

  public subscribe(eventType: string, callback: EventCallback): () => void {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }
    this.subscribers.get(eventType)!.add(callback);

    return () => {
      const callbacks = this.subscribers.get(eventType);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.subscribers.delete(eventType);
        }
      }
    };
  }

  public onStatusChange(listener: (connected: boolean) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.isConnected);
    return () => this.statusListeners.delete(listener);
  }

  private notifyStatus(connected: boolean): void {
    this.statusListeners.forEach((fn) => fn(connected));
  }

  private setConnected(connected: boolean): void {
    if (this.isConnected === connected) return;
    this.isConnected = connected;
    this.notifyStatus(connected);
  }
}

export const defaultAgentClient = new LocalAgentClient();
