import React, { useEffect, useRef, useState } from 'react';
import { WidgetDefinition, WidgetComponentProps } from '../../sdk/types';
import { Plus, Check, Trash2, CheckSquare, Pencil, GripVertical } from 'lucide-react';
import { Banner, Button, ConfirmButton, EmptyState, IconButton, Input, SegmentedControl, Spacer, Toolbar } from '../../ui';

interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  date: string; // YYYY-MM-DD
  createdAt: number;
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

      setItems(orderItems(loaded));
      context.storage.set('lastOpenedDate', today);
    }
    loadData();
  }, [context.storage]);

  const saveItems = async (updated: TodoItem[]) => {
    const ordered = orderItems(updated);
    setItems(ordered);
    await context.storage.set('items', ordered);
  };

  const handleAddItem = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newText.trim()) return;

    const newItem: TodoItem = {
      id: `todo-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      text: newText.trim(),
      done: false,
      date: getTodayString(),
      createdAt: Date.now(),
    };

    saveItems([...items, newItem]);
    setNewText('');
  };

  // Ao concluir, a tarefa vai para o fim da fila; ao reabrir, volta para o fim das pendentes.
  const handleToggle = (id: string) => {
    const target = items.find((item) => item.id === id);
    if (!target) return;
    const toggled = { ...target, done: !target.done };
    saveItems([...items.filter((item) => item.id !== id), toggled]);
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

    const updated = items.map((item) =>
      item.id === editingState.id ? { ...item, text: trimmed } : item
    );
    saveItems(updated);
    setEditingState(null);
  };

  const handleDelete = (id: string) => {
    const updated = items.filter((item) => item.id !== id);
    saveItems(updated);
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
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }} onClick={(e) => e.stopPropagation()}>
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
    version: '1.1.0',
    description: 'To-do List com visualização por dia/semana, reordenação por arraste e rotativo de tarefas pendentes.',
    icon: 'CheckSquare',
    author: 'Dashboard Core',
    status: 'stable',
    defaultSize: { w: 4, h: 5 },
    minSize: { w: 2, h: 4 },
    maxSize: { w: 8, h: 8 },
    requiresAgent: false,
  },
  component: TodoWidget,
};
