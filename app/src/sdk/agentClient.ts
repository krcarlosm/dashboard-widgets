import { AgentClientProtocol, AgentMessage } from './types';

type EventCallback = (payload: any) => void;

export class LocalAgentClient implements AgentClientProtocol {
  private ws: WebSocket | null = null;
  private url: string;
  private subscribers: Map<string, Set<EventCallback>> = new Map();
  private reconnectTimer: any = null;
  public isConnected: boolean = false;
  private statusListeners: Set<(connected: boolean) => void> = new Set();

  constructor(url: string = 'ws://127.0.0.1:8765/ws') {
    this.url = url;
    this.connect();
  }

  public connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[LocalAgentClient] Conectado ao Agent local');
        this.isConnected = true;
        this.notifyStatus(true);
        // Send initial handshake
        this.send({ type: 'handshake', payload: { client: 'dashboard-ui' } });
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
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        // Silencioso em caso de agent desligado para não poluir console continuamente
        this.ws?.close();
      };
    } catch {
      this.scheduleReconnect();
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
}

export const defaultAgentClient = new LocalAgentClient();
