import React, { useEffect, useRef, useState } from 'react';
import { WidgetDefinition, WidgetComponentProps } from '../../sdk/types';
import { Plus, Check, Trash2, CheckSquare, Pencil, GripVertical, Link2, Timer } from 'lucide-react';
import { Banner, Button, ConfirmButton, EmptyState, IconButton, Input, SegmentedControl, Spacer, Toolbar } from '../../ui';
import { SendToButton } from '../../ui/SendTo';
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

interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  date: string; // YYYY-MM-DD
  createdAt: number;
  /** Tarefa vinculada em outro widget (Kanban/Todo): concluir em um conclui no outro. */
  link?: TaskLink;
  /** Tempo de foco registrado pelo Pomodoro. */
  focusSeconds?: number;
}

interface EditingState {
  id: string;
  text: string;
}

interface DropTarget {
  id: string;
  position: 'before' | 'after';
}

// Pendentes primeiro, concluídas no fim; a ordem relativa de cada grupo é preservada.
const orderItems = (list: TodoItem[]): TodoItem[] => [
  ...list.filter((item) => !item.done),
  ...list.filter((item) => item.done),
];

const getTodayString = (): string => {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
};

const TodoWidget: React.FC<WidgetComponentProps> = ({ context }) => {
  const [items, setItems] = useState<TodoItem[]>([]);
  // Cópia síncrona da lista: mensagens de outros widgets podem chegar em sequência,
  // antes de o React renderizar de novo.
  const itemsRef = useRef<TodoItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [viewMode, setViewMode] = useState<'today' | 'week'>('today');
  const [newText, setNewText] = useState<string>('');
  const [pendingRollover, setPendingRollover] = useState<TodoItem[]>([]);
  const [editingState, setEditingState] = useState<EditingState | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  // Clique simples no texto conclui a tarefa, mas espera um instante: se vier um
  // duplo clique (editar), o clique simples é cancelado.
  const toggleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (toggleTimerRef.current) clearTimeout(toggleTimerRef.current);
  }, []);

  // Load tasks on mount
  useEffect(() => {
    async function loadData() {
      const savedItems = await context.storage.get<TodoItem[]>('items', []);
      const lastOpened = await context.storage.get<string>('lastOpenedDate', '');

      const today = getTodayString();
      const loaded = savedItems || [];

      // Check day transition
      if (lastOpened && lastOpened !== today) {
        const uncompletedPast = loaded.filter((item) => !item.done && item.date < today);
        if (uncompletedPast.length > 0) {
          setPendingRollover(uncompletedPast);
        }
      }

      itemsRef.current = orderItems(loaded);
      setItems(itemsRef.current);
      context.storage.set('lastOpenedDate', today);
      setIsLoaded(true);
    }
    loadData();
  }, [context.storage]);

  const saveItems = async (updated: TodoItem[]) => {
    const ordered = orderItems(updated);
    itemsRef.current = ordered;
    setItems(ordered);
    await context.storage.set('items', ordered);
  };

  const createItem = (text: string, extra: Partial<TodoItem> = {}): TodoItem => ({
    id: newItemId('todo'),
    text,
    done: false,
    date: getTodayString(),
    createdAt: Date.now(),
    ...extra,
  });

  /** Avisa a tarefa vinculada (se houver) de uma mudança feita aqui. */
  const notifyLinked = (item: TodoItem, message: WidgetMessage) => {
    if (item.link) void context.actions.send(item.link.instanceId, message).catch(() => {});
  };

  // ── Integração ("Enviar para…", tarefas vinculadas, Pomodoro) ─────────────
  useActionReceiver(
    context.actions,
    async (message) => {
      const current = itemsRef.current;
      switch (message.kind) {
        case 'text': {
          const created = textToTasks(message.text).map((text) => createItem(text));
          if (created.length) await saveItems([...current, ...created]);
          break;
        }
        case 'task': {
          if (current.some((item) => item.id === message.id)) break;
          await saveItems([...current, createItem(message.text, { id: message.id, done: message.done, link: message.link })]);
          break;
        }
        case 'task:update': {
          const target = current.find((item) => item.id === message.itemId);
          if (!target) break;
          const changed = { ...target, ...(message.done !== undefined ? { done: message.done } : {}), ...(message.text ? { text: message.text } : {}) };
          // Mudou de grupo (concluída/pendente): vai para o fim do novo grupo, como no clique.
          const next = changed.done !== target.done ? [...current.filter((item) => item.id !== target.id), changed] : current.map((item) => (item.id === target.id ? changed : item));
          await saveItems(next);
          break;
        }
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
    (query) => {
      if (query.type !== 'tasks:list') return null;
      return itemsRef.current.map<SharedTask>((item) => ({ id: item.id, text: item.text, done: item.done, focusSeconds: item.focusSeconds }));
    },
    isLoaded,
  );

  /** Para Kanban/outra lista: tarefa vinculada (se ainda não tiver vínculo); para os demais: o texto. */
  const buildSend = async (item: TodoItem, target: ActionTarget): Promise<WidgetMessage[]> => {
    const current = itemsRef.current.find((entry) => entry.id === item.id) ?? item;
    if (!target.accepts.includes('task') || current.link) return [{ kind: 'text', text: current.text }];
    const remoteId = newItemId(target.widgetId);
    await saveItems(itemsRef.current.map((entry) => (entry.id === item.id ? { ...entry, link: { instanceId: target.instanceId, itemId: remoteId } } : entry)));
    return [{ kind: 'task', text: current.text, id: remoteId, done: current.done, link: { instanceId: context.instanceId, itemId: item.id } }];
  };

  const handleAddItem = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newText.trim()) return;

    saveItems([...items, createItem(newText.trim())]);
    setNewText('');
  };

  // Ao concluir, a tarefa vai para o fim da fila; ao reabrir, volta para o fim das pendentes.
  const handleToggle = (id: string) => {
    const target = items.find((item) => item.id === id);
    if (!target) return;
    const toggled = { ...target, done: !target.done };
    saveItems([...items.filter((item) => item.id !== id), toggled]);
    if (target.link) notifyLinked(target, { kind: 'task:update', itemId: target.link.itemId, done: toggled.done });
  };

  const handleDragStart = (event: React.DragEvent<HTMLDivElement>, id: string) => {
    // O Firefox (Zen) só inicia o arraste quando há dados no dataTransfer.
    event.dataTransfer.setData('text/plain', id);
    event.dataTransfer.effectAllowed = 'move';
    setDraggingId(id);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>, target: TodoItem) => {
    const source = items.find((item) => item.id === draggingId);
    // Reordena apenas dentro do mesmo grupo (pendentes ou concluídas).
    if (!source || source.id === target.id || source.done !== target.done) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const rect = event.currentTarget.getBoundingClientRect();
    const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    if (dropTarget?.id !== target.id || dropTarget.position !== position) {
      setDropTarget({ id: target.id, position });
    }
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDropTarget(null);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const source = items.find((item) => item.id === draggingId);
    if (source && dropTarget) {
      const remaining = items.filter((item) => item.id !== source.id);
      const targetIndex = remaining.findIndex((item) => item.id === dropTarget.id);
      const insertAt = dropTarget.position === 'before' ? targetIndex : targetIndex + 1;
      remaining.splice(insertAt, 0, source);
      saveItems(remaining);
    }
    handleDragEnd();
  };

  const scheduleToggle = (id: string) => {
    if (toggleTimerRef.current) clearTimeout(toggleTimerRef.current);
    toggleTimerRef.current = setTimeout(() => {
      toggleTimerRef.current = null;
      handleToggle(id);
    }, 250);
  };

  const startEditing = (item: TodoItem) => {
    if (toggleTimerRef.current) {
      clearTimeout(toggleTimerRef.current);
      toggleTimerRef.current = null;
    }
    setEditingState({ id: item.id, text: item.text });
  };

  const saveEdit = () => {
    if (!editingState) return;

    const trimmed = editingState.text.trim();
    if (!trimmed) {
      setEditingState(null);
      return;
    }

    const original = items.find((item) => item.id === editingState.id);
    const updated = items.map((item) =>
      item.id === editingState.id ? { ...item, text: trimmed } : item
    );
    saveItems(updated);
    if (original?.link && original.text !== trimmed) notifyLinked(original, { kind: 'task:update', itemId: original.link.itemId, text: trimmed });
    setEditingState(null);
  };

  const handleDelete = (id: string) => {
    const removed = items.find((item) => item.id === id);
    const updated = items.filter((item) => item.id !== id);
    saveItems(updated);
    // A tarefa vinculada continua no outro widget, só sem o vínculo.
    if (removed?.link) notifyLinked(removed, { kind: 'task:unlink', itemId: removed.link.itemId });
  };

  const handleMoveRolloverToToday = () => {
    const today = getTodayString();
    const updated = items.map((item) =>
      pendingRollover.some((p) => p.id === item.id) ? { ...item, date: today } : item
    );
    saveItems(updated);
    setPendingRollover([]);
  };

  const handleDismissRollover = () => {
    setPendingRollover([]);
  };

  const todayStr = getTodayString();

  const filteredItems = viewMode === 'today'
    ? items.filter((item) => item.date === todayStr)
    : items;

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        color: 'var(--app-text)',
        fontSize: '12px',
      }}
    >
      {/* Header controls */}
      <Toolbar>
        <SegmentedControl
          ariaLabel="Período"
          value={viewMode}
          onChange={setViewMode}
          options={[
            { id: 'today', label: 'Hoje' },
            { id: 'week', label: 'Todas / Semana' },
          ]}
        />
        <Spacer />
        <span style={{ fontSize: 'var(--font-sm)', color: 'var(--app-muted)' }}>
          {items.filter((i) => i.done).length} / {items.length} concluídas
        </span>
      </Toolbar>

      {/* Day transition notification banner */}
      {pendingRollover.length > 0 && (
        <Banner tone="warning">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontWeight: 600 }}>Você tem {pendingRollover.length} tarefas pendentes de dias anteriores.</span>
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
              <Button onClick={handleDismissRollover}>Manter Arquivadas</Button>
              <Button variant="primary" onClick={handleMoveRolloverToToday}>Mover para Hoje</Button>
            </div>
          </div>
        </Banner>
      )}

      {/* Add Todo Input */}
      <form onSubmit={handleAddItem} style={{ display: 'flex', gap: '6px' }}>
        <Input
          type="text"
          aria-label="Nova tarefa"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder="Adicionar nova tarefa..."
          style={{ flex: 1, padding: '6px 10px' }}
        />
        <Button type="submit" variant="primary" aria-label="Adicionar tarefa" title="Adicionar tarefa" icon={<Plus size={16} />} style={{ padding: '6px 12px' }} />
      </form>

      {/* Task List */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {filteredItems.length === 0 ? (
          <EmptyState icon={<CheckSquare size={24} />} title="Nenhuma tarefa cadastrada." />
        ) : (
          filteredItems.map((item) => (
            <div
              key={item.id}
              draggable={editingState?.id !== item.id}
              onDragStart={(event) => handleDragStart(event, item.id)}
              onDragOver={(event) => handleDragOver(event, item)}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'var(--app-surface-elevated)',
                border: '1px solid var(--app-border)',
                borderRadius: '6px',
                padding: '6px 10px 6px 4px',
                gap: '8px',
                opacity: draggingId === item.id ? 0.4 : 1,
                boxShadow: dropTarget?.id === item.id
                  ? `inset 0 ${dropTarget.position === 'before' ? '2px' : '-2px'} 0 var(--widget-accent)`
                  : 'none',
              }}
            >
              <GripVertical
                size={13}
                color="var(--app-muted)"
                style={{ flexShrink: 0, cursor: 'grab' }}
                aria-label="Arrastar para reordenar"
              />
              <div
                onClick={() => {
                  if (editingState?.id !== item.id) scheduleToggle(item.id);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  flex: 1,
                  cursor: 'pointer',
                }}
              >
                <div
                  role="checkbox"
                  aria-checked={item.done}
                  aria-label={item.done ? `Reabrir "${item.text}"` : `Concluir "${item.text}"`}
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggle(item.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      handleToggle(item.id);
                    }
                  }}
                  style={{
                    width: '16px',
                    height: '16px',
                    minWidth: '16px',
                    minHeight: '16px',
                    flexShrink: 0,
                    borderRadius: '4px',
                    border: item.done ? 'none' : '1px solid var(--app-muted-strong)',
                    background: item.done ? 'var(--app-success)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {item.done && <Check size={12} color="var(--app-on-accent)" />}
                </div>

                {editingState?.id === item.id ? (
                  <input
                    autoFocus
                    aria-label="Editar texto da tarefa"
                    value={editingState.text}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setEditingState({ id: item.id, text: e.target.value })}
                    onBlur={saveEdit}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEdit();
                      if (e.key === 'Escape') setEditingState(null);
                    }}
                    style={{
                      flex: 1,
                      background: 'var(--app-input)',
                      border: '1px solid var(--app-border)',
                      borderRadius: '4px',
                      padding: '4px 6px',
                      color: 'var(--app-text)',
                      fontSize: '12px',
                      outline: 'none',
                    }}
                  />
                ) : (
                  <span
                    onDoubleClick={() => startEditing(item)}
                    style={{
                      textDecoration: item.done ? 'line-through' : 'none',
                      color: item.done ? 'var(--app-muted-strong)' : 'var(--app-text)',
                      fontSize: '12px',
                      lineHeight: '1.4',
                      wordBreak: 'break-word',
                    }}
                  >
                    {item.text}
                  </span>
                )}
                {item.focusSeconds ? (
                  <span title={`Tempo de foco no Pomodoro: ${formatFocus(item.focusSeconds)}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '10px', color: 'var(--app-danger)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                    <Timer size={10} /> {formatFocus(item.focusSeconds)}
                  </span>
                ) : null}
                {item.link && (
                  <span title={`Vinculada a ${context.actions.targets(['task']).find((target) => target.instanceId === item.link!.instanceId)?.title ?? 'outro widget'}: concluir em um conclui no outro`} aria-label="Tarefa vinculada" style={{ display: 'inline-flex', color: 'var(--widget-accent)', flexShrink: 0 }}>
                    <Link2 size={11} />
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }} onClick={(e) => e.stopPropagation()}>
                <SendToButton actions={context.actions} kinds={['task', 'text']} iconOnly label="Enviar tarefa para…" build={(target) => buildSend(item, target)} />
                <IconButton label="Editar tarefa" icon={<Pencil size={13} />} onClick={() => startEditing(item)} style={{ color: 'var(--widget-accent)' }} />
                <ConfirmButton label="Excluir tarefa" confirmLabel="Excluir?" icon={<Trash2 size={13} />} iconOnly onConfirm={() => handleDelete(item.id)} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export const todoWidget: WidgetDefinition = {
  manifest: {
    id: 'todo',
    name: 'Lista de Tarefas',
    version: '1.2.0',
    description: 'To-do List com visualização por dia/semana, reordenação por arraste, tarefas vinculadas ao Kanban e tempo de foco do Pomodoro.',
    icon: 'CheckSquare',
    author: 'Dashboard Core',
    status: 'stable',
    defaultSize: { w: 4, h: 5 },
    minSize: { w: 2, h: 4 },
    maxSize: { w: 8, h: 8 },
    requiresAgent: false,
    accepts: ['text', 'task'],
  },
  component: TodoWidget,
};
