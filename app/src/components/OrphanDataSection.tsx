import React, { useCallback, useEffect, useState } from 'react';
import { ArchiveRestore, Trash2 } from 'lucide-react';
import { useDashboardStore } from '../store/dashboardStore';
import { deleteInstanceData, listOrphanData, type OrphanData } from '../sdk/orphans';
import { confirmDialog } from '../ui/ConfirmDialog';
import { Button } from '../ui';

// Lixeira do perfil: dados que widgets removidos deixaram no navegador.
// "Restaurar" devolve o widget ao canvas com os dados; "Apagar" remove de vez.

const formatSize = (bytes: number) => (bytes < 1024 ? `${bytes} B` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const formatDate = (timestamp: number) =>
  timestamp ? new Date(timestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export const OrphanDataSection: React.FC<{ onChange?: () => void }> = ({ onChange }) => {
  const activeInstances = useDashboardStore((state) => state.activeInstances);
  const registeredWidgets = useDashboardStore((state) => state.registeredWidgets);
  const restoreWidgetInstance = useDashboardStore((state) => state.restoreWidgetInstance);
  const [orphans, setOrphans] = useState<OrphanData[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setOrphans(await listOrphanData(activeInstances.map((instance) => instance.instanceId)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível ler os dados salvos.');
    }
  }, [activeInstances]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const nameOf = (orphan: OrphanData) => registeredWidgets.get(orphan.widgetId)?.manifest.name ?? `Widget desconhecido (${orphan.widgetId})`;

  const remove = async (items: OrphanData[]) => {
    const message =
      items.length === 1
        ? `Os dados de "${nameOf(items[0])}" (${items[0].keys} itens, ${formatSize(items[0].bytes)}) serão apagados deste navegador. Não dá para desfazer.`
        : `Os dados de ${items.length} widgets removidos serão apagados deste navegador. Não dá para desfazer.`;
    if (!(await confirmDialog({ title: items.length === 1 ? 'Apagar dados do widget?' : 'Apagar todos os dados?', message, confirmLabel: 'Apagar' }))) return;
    try {
      await deleteInstanceData(items.map((item) => item.instanceId));
      await refresh();
      onChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível apagar.');
    }
  };

  const restore = (orphan: OrphanData) => {
    restoreWidgetInstance(orphan.instanceId, orphan.widgetId);
    onChange?.();
  };

  if (orphans === null) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }} data-testid="orphan-data">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--app-text)' }}>Dados de widgets removidos</span>
        {orphans.length > 1 && (
          <Button variant="ghost" icon={<Trash2 size={12} />} onClick={() => void remove(orphans)} style={{ color: 'var(--app-danger)' }}>
            Apagar todos
          </Button>
        )}
      </div>
      {error && <span style={{ fontSize: '11px', color: 'var(--app-danger)' }}>{error}</span>}
      {orphans.length === 0 ? (
        <span style={{ fontSize: '11px', color: 'var(--app-muted)' }}>Nenhum dado sobrando: todos os dados salvos pertencem a widgets do canvas.</span>
      ) : (
        orphans.map((orphan) => {
          const known = registeredWidgets.has(orphan.widgetId);
          return (
            <div
              key={orphan.instanceId}
              data-testid="orphan-item"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--app-surface-muted)', border: '1px solid var(--app-border)', borderRadius: '8px', padding: '6px 8px' }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nameOf(orphan)}</div>
                <div style={{ fontSize: '10px', color: 'var(--app-muted)' }}>
                  {orphan.keys} {orphan.keys === 1 ? 'item' : 'itens'} · {formatSize(orphan.bytes)} · última alteração {formatDate(orphan.updatedAt)}
                </div>
              </div>
              {known && (
                <Button icon={<ArchiveRestore size={12} />} onClick={() => restore(orphan)} title="Devolver o widget ao canvas com estes dados">
                  Restaurar
                </Button>
              )}
              <Button variant="ghost" icon={<Trash2 size={12} />} onClick={() => void remove([orphan])} aria-label={`Apagar dados de ${nameOf(orphan)}`} style={{ color: 'var(--app-danger)' }}>
                Apagar
              </Button>
            </div>
          );
        })
      )}
    </div>
  );
};
