import React, { useEffect, useState } from 'react';
import { WidgetDefinition, WidgetComponentProps } from '../../sdk/types';
import { Plus, Trash2, CheckCircle2, Clock, CircleDot } from 'lucide-react';
import { Button, ConfirmButton, Input, Toolbar } from '../../ui';
import { alpha } from '../../theme/tokens';

export type KanbanStatus = 'todo' | 'in_progress' | 'done';

export interface KanbanItem {
  id: string;
  text: string;
  status: KanbanStatus;
  createdAt: number;
}

const MAX_CHAR_COUNT = 50;

const KanbanWidget: React.FC<WidgetComponentProps> = ({ context }) => {
  const [items, setItems] = useState<KanbanItem[]>([]);
  const [newTaskText, setNewTaskText] = useState<string>('');
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);

  // Load items from storage
  useEffect(() => {
    async function loadData() {
      const saved = await context.storage.get<KanbanItem[]>('kanban_items', [
        { id: '1', text: '💡 Rascunhar novas ideias', status: 'todo', createdAt: Date.now() },
        { id: '2', text: '⚡ Desenvolver protótipo', status: 'in_progress', createdAt: Date.now() - 1000 },
        { id: '3', text: '✅ Finalizar documentação', status: 'done', createdAt: Date.now() - 2000 },
      ]);
      setItems(saved || []);
    }
    loadData();
  }, [context.storage]);

  const saveItems = async (newList: KanbanItem[]) => {
    setItems(newList);
    await context.storage.set('kanban_items', newList);
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
    await saveItems(items.filter((item) => item.id !== id));
  };

  const setItemStatus = async (id: string, newStatus: KanbanStatus) => {
    const updated = items.map((item) =>
      item.id === id ? { ...item, status: newStatus } : item
    );
    await saveItems(updated);
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
                      draggable
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
                      {/* Card Text */}
                      <span
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

                        {/* Excluir: pede confirmação no segundo clique */}
                        <ConfirmButton label="Excluir card" confirmLabel="Excluir?" icon={<Trash2 size={11} />} iconOnly onConfirm={() => removeItem(item.id)} />
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
    version: '1.0.0',
    description: 'Kanban ágil de tarefas simples com movimentação por cliques 🌑🌓🌕 ou arrastar.',
    icon: 'Kanban',
    author: 'Dashboard Core',
    status: 'stable',
    defaultSize: { w: 5, h: 4 },
    minSize: { w: 3, h: 3 },
    maxSize: { w: 12, h: 8 },
    requiresAgent: false,
  },
  component: KanbanWidget,
};
