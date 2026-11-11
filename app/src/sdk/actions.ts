import { useEffect, useRef } from 'react';
import { db } from './storage';

// ─────────────────────────────────────────────────────────────────────────────
// Integração entre widgets ("Enviar para…").
//
// Cada widget declara no manifesto o que aceita (`accepts`) e registra um
// receptor com `context.actions.onReceive`. Quem envia lista os destinos
// compatíveis (`targets`) e entrega com `send`.
//
// Se o destino não estiver montado no momento, a mensagem fica guardada na
// caixa de entrada dele (IndexedDB, chave `__inbox` da instância) e é entregue
// quando ele abrir. Por isso o remetente nunca depende de uma resposta:
// quem precisa de um id (tarefas vinculadas) já o envia pronto.
// ─────────────────────────────────────────────────────────────────────────────

export type ActionKind = 'text' | 'task' | 'file' | 'url';

export interface TaskLink {
  instanceId: string;
  itemId: string;
}

/** Conteúdo que o usuário envia de um widget para outro. */
export type ActionPayload =
  | { kind: 'text'; text: string; title?: string }
  /** Tarefa vinda do Todo/Kanban: `id` é o id que o destino deve usar; `link` aponta de volta para a origem. */
  | { kind: 'task'; text: string; id: string; done: boolean; link: TaskLink }
  | { kind: 'file'; path: string; name: string }
  | { kind: 'url'; url: string; title?: string };

/** Mensagens de sincronização entre tarefas vinculadas e do Pomodoro. */
export type SyncMessage =
  | { kind: 'task:update'; itemId: string; done?: boolean; text?: string }
  | { kind: 'task:unlink'; itemId: string }
  | { kind: 'task:time'; itemId: string; seconds: number };

export type WidgetMessage = ActionPayload | SyncMessage;

export interface MessageSource {
  instanceId: string;
  widgetId: string;
  title: string;
}

export interface ActionTarget extends MessageSource {
  accepts: ActionKind[];
}

/** Tarefa exposta ao Pomodoro (`request(target, { type: 'tasks:list' })`). */
export interface SharedTask {
  id: string;
  text: string;
  done: boolean;
  focusSeconds?: number;
}

export type WidgetQuery = { type: 'tasks:list' };

export type ReceiveHandler = (message: WidgetMessage, from: MessageSource) => void | Promise<void>;
export type RequestHandler = (query: WidgetQuery) => unknown;

export interface WidgetActions {
  /** Instâncias (exceto esta) que aceitam algum dos tipos, na ordem do canvas. */
  targets(kinds: ActionKind | ActionKind[]): ActionTarget[];
  /** Entrega a mensagem; `queued` = o destino não está aberto e recebe ao abrir. */
  send(targetId: string, message: WidgetMessage): Promise<{ queued: boolean }>;
  onReceive(handler: ReceiveHandler): () => void;
  /** Consulta direta a uma instância aberta; `null` se ela não estiver aberta ou não responder. */
  request<T = unknown>(targetId: string, query: WidgetQuery): Promise<T | null>;
  onRequest(handler: RequestHandler): () => void;
}

interface InboxEntry {
  message: WidgetMessage;
  from: MessageSource;
  at: number;
}

export const INBOX_KEY = '__inbox';
const inboxId = (instanceId: string) => `${instanceId}:${INBOX_KEY}`;

type TargetsProvider = () => ActionTarget[];

export class ActionBus {
  private receivers = new Map<string, ReceiveHandler>();
  private responders = new Map<string, RequestHandler>();
  private draining = new Map<string, Promise<void>>();
  private provider: TargetsProvider = () => [];

  /** O App informa como listar as instâncias do canvas (vem do store). */
  setTargetsProvider(provider: TargetsProvider) {
    this.provider = provider;
  }

  describe(instanceId: string): MessageSource {
    const target = this.provider().find((item) => item.instanceId === instanceId);
    return target ? { instanceId, widgetId: target.widgetId, title: target.title } : { instanceId, widgetId: instanceId.replace(/-\d+$/, ''), title: '' };
  }

  targets(fromId: string, kinds: ActionKind | ActionKind[]): ActionTarget[] {
    const wanted = Array.isArray(kinds) ? kinds : [kinds];
    return this.provider().filter((target) => target.instanceId !== fromId && target.accepts.some((kind) => wanted.includes(kind)));
  }

  async send(fromId: string, targetId: string, message: WidgetMessage): Promise<{ queued: boolean }> {
    const from = this.describe(fromId);
    const receiver = this.receivers.get(targetId);
    if (receiver) {
      await this.draining.get(targetId);
      await receiver(message, from);
      return { queued: false };
    }
    await db.transaction('rw', db.kvStore, async () => {
      const record = await db.kvStore.get(inboxId(targetId));
      const entries: InboxEntry[] = Array.isArray(record?.value) ? record!.value : [];
      entries.push({ message, from, at: Date.now() });
      await db.kvStore.put({ id: inboxId(targetId), instanceId: targetId, key: INBOX_KEY, value: entries, updatedAt: Date.now() });
    });
    return { queued: true };
  }

  register(instanceId: string, handler: ReceiveHandler): () => void {
    this.receivers.set(instanceId, handler);
    const drain = this.drain(instanceId);
    this.draining.set(instanceId, drain);
    void drain.finally(() => {
      if (this.draining.get(instanceId) === drain) this.draining.delete(instanceId);
    });
    return () => {
      if (this.receivers.get(instanceId) === handler) this.receivers.delete(instanceId);
    };
  }

  /** Entrega o que chegou enquanto o widget estava fechado. */
  private async drain(instanceId: string) {
    let entries: InboxEntry[] = [];
    try {
      await db.transaction('rw', db.kvStore, async () => {
        const record = await db.kvStore.get(inboxId(instanceId));
        entries = Array.isArray(record?.value) ? record!.value : [];
        if (record) await db.kvStore.delete(inboxId(instanceId));
      });
    } catch (err) {
      console.error('[ActionBus] Falha ao ler a caixa de entrada', err);
      return;
    }
    for (let index = 0; index < entries.length; index++) {
      // Usa o receptor atual: o widget pode ter remontado enquanto a caixa era lida.
      const current = this.receivers.get(instanceId) ?? null;
      if (!current) {
        // Fechou de novo antes de receber tudo: o resto volta para a caixa.
        for (const entry of entries.slice(index)) await this.send(entry.from.instanceId, instanceId, entry.message);
        return;
      }
      try {
        await current(entries[index].message, entries[index].from);
      } catch (err) {
        console.error('[ActionBus] Falha ao entregar mensagem guardada', err);
      }
    }
  }

  respond(instanceId: string, handler: RequestHandler): () => void {
    this.responders.set(instanceId, handler);
    return () => {
      if (this.responders.get(instanceId) === handler) this.responders.delete(instanceId);
    };
  }

  async request<T>(targetId: string, query: WidgetQuery): Promise<T | null> {
    const responder = this.responders.get(targetId);
    if (!responder) return null;
    try {
      return ((await responder(query)) as T) ?? null;
    } catch {
      return null;
    }
  }

  /** A API que cada instância recebe no `context.actions`. */
  forInstance(instanceId: string): WidgetActions {
    return {
      targets: (kinds) => this.targets(instanceId, kinds),
      send: (targetId, message) => this.send(instanceId, targetId, message),
      onReceive: (handler) => this.register(instanceId, handler),
      request: (targetId, query) => this.request(targetId, query),
      onRequest: (handler) => this.respond(instanceId, handler),
    };
  }
}

export const actionBus = new ActionBus();

// ── Utilidades para os widgets ──────────────────────────────────────────────

/**
 * Converte um texto em tarefas: uma por linha não vazia, sem marcadores de lista
 * ("- ", "* ", "1. ", "- [ ] "). Limita a 50 tarefas por envio.
 */
export function textToTasks(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^(?:[-*+•]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+|\[[ xX]\]\s+)/, '').trim())
    .filter(Boolean)
    .slice(0, 50);
}

/** Descrição curta de um envio, para avisos ("Enviado para Lista de Tarefas"). */
export function sentNotice(target: MessageSource, queued: boolean): string {
  return queued ? `Guardado para ${target.title}: aparece quando ele abrir.` : `Enviado para ${target.title}.`;
}

/** Tempo de foco: "25 min", "1 h 15 min". */
export const formatFocus = (seconds: number): string => {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
};

export const newItemId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

// ── Hooks ────────────────────────────────────────────────────────────────────

/** Registra o receptor da instância; o handler pode mudar a cada render (usa sempre o mais recente). */
export function useActionReceiver(actions: WidgetActions | undefined, handler: ReceiveHandler, enabled = true) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!actions || !enabled) return;
    return actions.onReceive((message, from) => ref.current(message, from));
  }, [actions, enabled]);
}

/** Responde às consultas de outras instâncias (ex.: o Pomodoro listando tarefas). */
export function useActionResponder(actions: WidgetActions | undefined, handler: RequestHandler, enabled = true) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!actions || !enabled) return;
    return actions.onRequest((query) => ref.current(query));
  }, [actions, enabled]);
}
