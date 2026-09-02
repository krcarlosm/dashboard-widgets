import React, { useEffect, useState } from 'react';
import { WidgetDefinition, WidgetComponentProps } from '../../sdk/types';
import { Plus, Check, Trash2, Calendar, CheckSquare, ListFilter, AlertCircle, Pencil } from 'lucide-react';

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

const getTodayString = (): string => {
  const d = new Date();
  return d.toISOString().split('T')[0];
};

const TodoWidget: React.FC<WidgetComponentProps> = ({ context }) => {
  const [items, setItems] = useState<TodoItem[]>([]);
  const [viewMode, setViewMode] = useState<'today' | 'week'>('today');
  const [newText, setNewText] = useState<string>('');
  const [pendingRollover, setPendingRollover] = useState<TodoItem[]>([]);
  const [editingState, setEditingState] = useState<EditingState | null>(null);

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

      setItems(loaded);
      context.storage.set('lastOpenedDate', today);
    }
    loadData();
  }, [context.storage]);

  const saveItems = async (updated: TodoItem[]) => {
    setItems(updated);
    await context.storage.set('items', updated);
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

  const handleToggle = (id: string) => {
    const updated = items.map((item) =>
      item.id === id ? { ...item, done: !item.done } : item
    );
    saveItems(updated);
  };

  const startEditing = (item: TodoItem) => {
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
        color: '#f8fafc',
        fontSize: '12px',
      }}
    >
      {/* Header controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '4px', background: '#0f172a', padding: '2px', borderRadius: '6px', border: '1px solid #334155' }}>
          <button
            onClick={() => setViewMode('today')}
            style={{
              background: viewMode === 'today' ? 'var(--app-accent-strong)' : 'transparent',
              color: viewMode === 'today' ? '#ffffff' : '#94a3b8',
              border: 'none',
              borderRadius: '4px',
              padding: '3px 8px',
              fontSize: '11px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Hoje
          </button>
          <button
            onClick={() => setViewMode('week')}
            style={{
              background: viewMode === 'week' ? 'var(--app-accent-strong)' : 'transparent',
              color: viewMode === 'week' ? '#ffffff' : '#94a3b8',
              border: 'none',
              borderRadius: '4px',
              padding: '3px 8px',
              fontSize: '11px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Todas / Semana
          </button>
        </div>

        <span style={{ fontSize: '11px', color: '#64748b' }}>
          {items.filter((i) => i.done).length} / {items.length} concluídas
        </span>
      </div>

      {/* Day transition notification banner */}
      {pendingRollover.length > 0 && (
        <div
          style={{
            background: 'rgba(245, 158, 11, 0.15)',
            border: '1px solid rgba(245, 158, 11, 0.4)',
            borderRadius: '6px',
            padding: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            fontSize: '11px',
            color: '#fef08a',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
            <AlertCircle size={14} color="#f59e0b" />
            <span>Você tem {pendingRollover.length} tarefas pendentes de dias anteriores.</span>
          </div>
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
            <button
              onClick={handleDismissRollover}
              style={{ background: 'transparent', border: '1px solid #94a3b8', color: '#94a3b8', borderRadius: '4px', padding: '2px 8px', fontSize: '10px', cursor: 'pointer' }}
            >
              Manter Arquivadas
            </button>
            <button
              onClick={handleMoveRolloverToToday}
              style={{ background: '#f59e0b', border: 'none', color: '#0f172a', borderRadius: '4px', padding: '2px 8px', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}
            >
              Mover para Hoje
            </button>
          </div>
        </div>
      )}

      {/* Add Todo Input */}
      <form onSubmit={handleAddItem} style={{ display: 'flex', gap: '6px' }}>
        <input
          type="text"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder="Adicionar nova tarefa..."
          style={{
            flex: 1,
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid #334155',
            borderRadius: '6px',
            padding: '6px 10px',
            color: '#f8fafc',
            fontSize: '12px',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          style={{
            background: 'var(--app-accent-strong)',
            border: 'none',
            color: '#ffffff',
            borderRadius: '6px',
            padding: '6px 12px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Plus size={16} />
        </button>
      </form>

      {/* Task List */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {filteredItems.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b', gap: '4px' }}>
            <CheckSquare size={24} />
            <span>Nenhuma tarefa cadastrada.</span>
          </div>
        ) : (
          filteredItems.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(30, 41, 59, 0.5)',
                border: '1px solid rgba(51, 65, 85, 0.5)',
                borderRadius: '6px',
                padding: '6px 10px',
                gap: '8px',
              }}
            >
              <div
                onClick={() => handleToggle(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  flex: 1,
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    width: '16px',
                    height: '16px',
                    minWidth: '16px',
                    minHeight: '16px',
                    flexShrink: 0,
                    borderRadius: '4px',
                    border: item.done ? 'none' : '1px solid #64748b',
                    background: item.done ? '#10b981' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {item.done && <Check size={12} color="#ffffff" />}
                </div>

                {editingState?.id === item.id ? (
                  <input
                    autoFocus
                    value={editingState.text}
                    onChange={(e) => setEditingState({ id: item.id, text: e.target.value })}
                    onBlur={saveEdit}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEdit();
                      if (e.key === 'Escape') setEditingState(null);
                    }}
                    style={{
                      flex: 1,
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid #334155',
                      borderRadius: '4px',
                      padding: '4px 6px',
                      color: '#f8fafc',
                      fontSize: '12px',
                      outline: 'none',
                    }}
                  />
                ) : (
                  <span
                    onDoubleClick={() => startEditing(item)}
                    style={{
                      textDecoration: item.done ? 'line-through' : 'none',
                      color: item.done ? '#64748b' : '#f8fafc',
                      fontSize: '12px',
                      lineHeight: '1.4',
                      wordBreak: 'break-word',
                    }}
                  >
                    {item.text}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    startEditing(item);
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--app-accent)',
                    cursor: 'pointer',
                    padding: '2px',
                  }}
                  title="Editar tarefa"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(item.id);
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#64748b',
                    cursor: 'pointer',
                    padding: '2px',
                  }}
                  title="Excluir tarefa"
                >
                  <Trash2 size={13} />
                </button>
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
    version: '1.0.0',
    description: 'To-do List com visualização por dia/semana e rotativo de tarefas pendentes.',
    icon: 'CheckSquare',
    author: 'Dashboard Core',
    status: 'stable',
    defaultSize: { w: 4, h: 5 },
    minSize: { w: 3, h: 4 },
    maxSize: { w: 8, h: 8 },
    requiresAgent: false,
  },
  component: TodoWidget,
};
