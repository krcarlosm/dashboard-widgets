import React, { useEffect, useRef, useState } from 'react';
import { WidgetDefinition, WidgetComponentProps } from '../../sdk/types';
import { Plus, Trash2, CheckCircle2, Clock, CircleDot, Link2, Pencil, Timer } from 'lucide-react';
import { Button, ConfirmButton, IconButton, Input, Toolbar } from '../../ui';
import { SendToButton } from '../../ui/SendTo';
import { alpha } from '../../theme/tokens';
import {
  formatFocus,
  newItemId,
  textToTasks,
  useActionReceiver,
  useActionResponder,
  type ActionTarget,
  type SharedTask,
  type TaskLink,
  type WidgetMessage,
} from '../../sdk/actions';

export type KanbanStatus = 'todo' | 'in_progress' | 'done';

export interface KanbanItem {
  id: string;
  text: string;
  status: KanbanStatus;
  createdAt: number;
  /** Tarefa vinculada em outro widget (Todo/Kanban): concluir em um conclui no outro. */
  link?: TaskLink;
  /** Tempo de foco registrado pelo Pomodoro. */
  focusSeconds?: number;
}

const MAX_CHAR_COUNT = 50;
// Textos recebidos ou editados podem ser maiores que os digitados no campo rápido.
const MAX_EDIT_CHARS = 200;

const KanbanWidget: React.FC<WidgetComponentProps> = ({ context }) => {
  const [items, setItems] = useState<KanbanItem[]>([]);
  const itemsRef = useRef<KanbanItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [newTaskText, setNewTaskText] = useState<string>('');
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);

  // Load items from storage
  useEffect(() => {
    async function loadData() {
      const saved = await context.storage.get<KanbanItem[]>('kanban_items', [
        { id: '1', text: '💡 Rascunhar novas ideias', status: 'todo', createdAt: Date.now() },
        { id: '2', text: '⚡ Desenvolver protótipo', status: 'in_progress', createdAt: Date.now() - 1000 },
        { id: '3', text: '✅ Finalizar documentação', status: 'done', createdAt: Date.now() - 2000 },
      ]);
      itemsRef.current = saved || [];
      setItems(itemsRef.current);
      setIsLoaded(true);
    }
    loadData();
  }, [context.storage]);

  const saveItems = async (newList: KanbanItem[]) => {
    itemsRef.current = newList;
    setItems(newList);
    await context.storage.set('kanban_items', newList);
  };

  const notifyLinked = (item: KanbanItem, message: WidgetMessage) => {
    if (item.link) void context.actions.send(item.link.instanceId, message).catch(() => {});
  };

  const createItem = (text: string, extra: Partial<KanbanItem> = {}): KanbanItem => ({
    id: newItemId('kanban'),
    text: text.slice(0, MAX_EDIT_CHARS),
    status: 'todo',
    createdAt: Date.now(),
    ...extra,
  });

  // ── Integração ("Enviar para…", tarefas vinculadas, Pomodoro) ─────────────
  useActionReceiver(
    context.actions,
    async (message) => {
      const current = itemsRef.current;
      switch (message.kind) {
        case 'text': {
          const created = textToTasks(message.text).map((text) => createItem(text));
          if (created.length) await saveItems([...created, ...current]);
          break;
        }
        case 'task':
          if (current.some((item) => item.id === message.id)) break;
          await saveItems([createItem(message.text, { id: message.id, status: message.done ? 'done' : 'todo', link: message.link }), ...current]);
          break;
        case 'task:update':
          await saveItems(
            current.map((item) => {
              if (item.id !== message.itemId) return item;
              // Reaberta no outro widget: sai de "Concluído"; o "Em andamento" é preservado.
              const status: KanbanStatus = message.done === true ? 'done' : message.done === false && item.status === 'done' ? 'todo' : item.status;
              return { ...item, status, ...(message.text ? { text: message.text.slice(0, MAX_EDIT_CHARS) } : {}) };
            }),
          );
          break;
        case 'task:unlink':
          await saveItems(current.map((item) => (item.id === message.itemId ? { ...item, link: undefined } : item)));
          break;
        case 'task:time':
          await saveItems(current.map((item) => (item.id === message.itemId ? { ...item, focusSeconds: (item.focusSeconds ?? 0) + message.seconds } : item)));
          break;
      }
    },
    isLoaded,
  );

  useActionResponder(
    context.actions,
    (query) =>
      query.type === 'tasks:list'
        ? itemsRef.current.map<SharedTask>((item) => ({ id: item.id, text: item.text, done: item.status === 'done', focusSeconds: item.focusSeconds }))
        : null,
    isLoaded,
  );

  const buildSend = async (item: KanbanItem, target: ActionTarget): Promise<WidgetMessage[]> => {
    const current = itemsRef.current.find((entry) => entry.id === item.id) ?? item;
    if (!target.accepts.includes('task') || current.link) return [{ kind: 'text', text: current.text }];
    const remoteId = newItemId(target.widgetId);
    await saveItems(itemsRef.current.map((entry) => (entry.id === item.id ? { ...entry, link: { instanceId: target.instanceId, itemId: remoteId } } : entry)));
    return [{ kind: 'task', text: current.text, id: remoteId, done: current.status === 'done', link: { instanceId: context.instanceId, itemId: item.id } }];
  };

  const saveEdit = async () => {
    if (!editing) return;
    const text = editing.text.trim().slice(0, MAX_EDIT_CHARS);
    const original = items.find((item) => item.id === editing.id);
    setEditing(null);
    if (!text || !original || text === original.text) return;
    await saveItems(items.map((item) => (item.id === original.id ? { ...item, text } : item)));
    notifyLinked(original, { kind: 'task:update', itemId: original.link?.itemId ?? '', text });
  };

  const addItem = async () => {
    const trimmed = newTaskText.trim().substring(0, MAX_CHAR_COUNT);
    if (!trimmed) return;

    const newItem: KanbanItem = {
      id: `kanban-${Date.now()}`,
      text: trimmed,
      status: 'todo',
      createdAt: Date.now(),
    };

    await saveItems([newItem, ...items]);
    setNewTaskText('');
  };

  const removeItem = async (id: string) => {
    const removed = items.find((item) => item.id === id);
    await saveItems(items.filter((item) => item.id !== id));
    if (removed?.link) notifyLinked(removed, { kind: 'task:unlink', itemId: removed.link.itemId });
  };

  const setItemStatus = async (id: string, newStatus: KanbanStatus) => {
    const original = items.find((item) => item.id === id);
    const updated = items.map((item) =>
      item.id === id ? { ...item, status: newStatus } : item
    );
    await saveItems(updated);
    // Só entrar ou sair de "Concluído" importa para a tarefa vinculada.
    if (original?.link && (original.status === 'done') !== (newStatus === 'done')) {
      notifyLinked(original, { kind: 'task:update', itemId: original.link.itemId, done: newStatus === 'done' });
    }
  };

  // Drag & Drop handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedItemId(id);
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: KanbanStatus) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain') || draggedItemId;
    if (id) {
      await setItemStatus(id, targetStatus);
    }
    setDraggedItemId(null);
  };

  const columns: { id: KanbanStatus; label: string; icon: React.ReactNode; color: string; badgeBg: string }[] = [
    { id: 'todo', label: 'À Fazer', icon: <CircleDot size={12} color="var(--widget-accent)" />, color: 'var(--app-muted)', badgeBg: 'var(--app-surface-elevated)' },
    { id: 'in_progress', label: 'Em Andamento', icon: <Clock size={12} color="var(--widget-accent)" />, color: 'var(--widget-accent)', badgeBg: 'var(--widget-accent-soft)' },
    { id: 'done', label: 'Concluído', icon: <CheckCircle2 size={12} color="var(--app-success)" />, color: 'var(--app-success)', badgeBg: 'var(--app-success-soft)' },
  ];

  const statusIcons: Record<KanbanStatus, { emoji: string; title: string }> = {
    todo: { emoji: '🌑', title: 'À Fazer' },
    in_progress: { emoji: '🌓', title: 'Em Andamento' },
    done: { emoji: '🌕', title: 'Concluído' },
  };

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        color: 'var(--app-text)',
        fontSize: '12px',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {/* Task Input Box */}
      <Toolbar>
        <div style={{ flex: 1, minWidth: 0, position: 'relative', display: 'flex' }}>
          <Input
            type="text"
            aria-label="Nova tarefa do Kanban"
            maxLength={MAX_CHAR_COUNT}
            value={newTaskText}
            onChange={(e) => setNewTaskText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addItem();
            }}
            placeholder="Nova tarefa (max 50 caracteres)..."
            style={{ flex: 1, paddingRight: '40px', fontSize: 'var(--font-sm)' }}
          />
          <span style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '9px', color: 'var(--app-muted)' }}>
            {newTaskText.length}/{MAX_CHAR_COUNT}
          </span>
        </div>
        <Button variant="primary" onClick={addItem} title="Adicionar Tarefa" icon={<Plus size={13} />}>
          Add
        </Button>
      </Toolbar>

      {/* Kanban Board Columns */}
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '8px',
          minHeight: 0,
          overflowX: 'auto',
        }}
      >
        {columns.map((col) => {
          const colItems = items.filter((item) => item.status === col.id);

          return (
            <div
              key={col.id}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, col.id)}
              style={{
                background: 'var(--app-surface-muted)',
                border: '1px solid var(--app-border)',
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                padding: '6px',
                gap: '6px',
                minHeight: 0,
                overflow: 'hidden',
              }}
            >
              {/* Column Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '4px 6px',
                  background: col.badgeBg,
                  borderRadius: '6px',
                  border: `1px solid ${alpha(col.color, 20)}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {col.icon}
                  <span style={{ fontSize: '10px', fontWeight: 700, color: col.color }}>
                    {col.label}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: '9px',
                    fontWeight: 700,
                    color: col.color,
                    background: alpha(col.color, 12),
                    padding: '0 5px',
                    borderRadius: '8px',
                  }}
                >
                  {colItems.length}
                </span>
              </div>

              {/* Items List inside Column */}
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  paddingRight: '2px',
                }}
              >
                {colItems.length === 0 ? (
                  <div style={{ fontSize: '10px', color: 'var(--app-muted)', textAlign: 'center', marginTop: '12px', fontStyle: 'italic' }}>
                    Vazio
                  </div>
                ) : (
                  colItems.map((item) => (
                    <div
                      key={item.id}
                      data-testid="kanban-card"
                      draggable={editing?.id !== item.id}
                      onDragStart={(e) => handleDragStart(e, item.id)}
                      style={{
                        background: 'var(--app-surface-elevated)',
                        border: '1px solid var(--app-border)',
                        borderRadius: '6px',
                        padding: '6px 8px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        cursor: 'grab',
                        transition: 'transform 0.15s, box-shadow 0.15s',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                      }}
                    >
                      {/* Card Text (duplo clique edita) */}
                      {editing?.id === item.id ? (
                        <input
                          autoFocus
                          aria-label="Editar texto do card"
                          value={editing.text}
                          maxLength={MAX_EDIT_CHARS}
                          onChange={(event) => setEditing({ id: item.id, text: event.target.value })}
                          onBlur={() => void saveEdit()}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') void saveEdit();
                            if (event.key === 'Escape') setEditing(null);
                          }}
                          style={{ width: '100%', boxSizing: 'border-box', background: 'var(--app-input)', border: '1px solid var(--app-border)', borderRadius: '4px', padding: '3px 5px', color: 'var(--app-text)', fontSize: '11px', outline: 'none' }}
                        />
                      ) : (
                        <span
                          onDoubleClick={() => setEditing({ id: item.id, text: item.text })}
                          title="Duplo clique para editar"
                          style={{
                            fontSize: '11px',
                            color: item.status === 'done' ? 'var(--app-muted)' : 'var(--app-text)',
                            textDecoration: item.status === 'done' ? 'line-through' : 'none',
                            wordBreak: 'break-word',
                            lineHeight: '1.4',
                          }}
                        >
                          {item.text}
                        </span>
                      )}
                      {(item.link || item.focusSeconds) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px' }}>
                          {item.link && (
                            <span title="Vinculada a uma lista de tarefas: concluir em um conclui no outro" aria-label="Tarefa vinculada" style={{ display: 'inline-flex', color: 'var(--widget-accent)' }}>
                              <Link2 size={10} />
                            </span>
                          )}
                          {item.focusSeconds ? (
                            <span title={`Tempo de foco no Pomodoro: ${formatFocus(item.focusSeconds)}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', color: 'var(--app-danger)' }}>
                              <Timer size={10} /> {formatFocus(item.focusSeconds)}
                            </span>
                          ) : null}
                        </div>
                      )}

                      {/* Card Actions Footer */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
                        {/* Status Cycle Button 🌑🌓🌕 */}
                        <div style={{ display: 'flex', gap: '2px' }}>
                          {(['todo', 'in_progress', 'done'] as KanbanStatus[]).map((st) => (
                            <button
                              key={st}
                              onClick={() => setItemStatus(item.id, st)}
                              title={`Mudar para: ${statusIcons[st].title}`}
                              aria-label={`Mudar para: ${statusIcons[st].title}`}
                              aria-pressed={item.status === st}
                              style={{
                                background: item.status === st ? 'var(--widget-accent-soft)' : 'transparent',
                                border: `1px solid ${item.status === st ? 'var(--widget-accent)' : 'transparent'}`,
                                borderRadius: '4px',
                                padding: '1px 3px',
                                cursor: 'pointer',
                                fontSize: '11px',
                                lineHeight: '1',
                              }}
                            >
                              {statusIcons[st].emoji}
                            </button>
                          ))}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <SendToButton actions={context.actions} kinds={['task', 'text']} iconOnly label="Enviar card para…" build={(target) => buildSend(item, target)} style={{ padding: '1px 3px' }} />
                          <IconButton label="Editar card" icon={<Pencil size={11} />} onClick={() => setEditing({ id: item.id, text: item.text })} style={{ padding: '1px 3px' }} />
                          {/* Excluir: pede confirmação no segundo clique */}
                          <ConfirmButton label="Excluir card" confirmLabel="Excluir?" icon={<Trash2 size={11} />} iconOnly onConfirm={() => removeItem(item.id)} />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const kanbanWidget: WidgetDefinition = {
  manifest: {
    id: 'kanban',
    name: 'Mini-Kanban',
    version: '1.1.0',
    description: 'Kanban ágil com movimentação por cliques 🌑🌓🌕 ou arrastar, edição de texto e cards vinculados à Lista de Tarefas.',
    icon: 'Kanban',
    author: 'Dashboard Core',
    status: 'stable',
    defaultSize: { w: 5, h: 4 },
    minSize: { w: 3, h: 3 },
    maxSize: { w: 12, h: 8 },
    requiresAgent: false,
    accepts: ['text', 'task'],
  },
  component: KanbanWidget,
};
