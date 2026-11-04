import React, { useCallback, useEffect, useState } from 'react';
import { Clock, Download, HardDrive, History, Power, RotateCcw, Upload } from 'lucide-react';
import { BackupScope, createDashboardBackup, restoreDashboardBackup } from '../sdk/storage';
import { defaultAgentClient } from '../sdk/agentClient';
import { AutoBackupState, BackupStatus, getAutoBackupState, subscribeAutoBackup } from '../sdk/autoBackup';
import { confirmDialog } from '../ui/ConfirmDialog';

// ─────────────────────────────────────────────────────────────────────────────
// BackupSection — backup automático diário, backup manual, lista de backups
// salvos com restauração e início automático do agente. Fica no ProfileModal.
//
// Nomes dos arquivos: auto-dashboard-backup-… (rodízio de 10) e
// manual-dashboard-backup-… (nunca apagados). Arquivos antigos sem prefixo
// aparecem como manuais.
// ─────────────────────────────────────────────────────────────────────────────

interface BackupFile {
  name: string;
  kind: 'auto' | 'manual';
  createdAt: string;
  size: number;
}

interface AutostartStatus {
  supported: boolean;
  enabled: boolean;
  path: string | null;
}

const formatDateTime = (iso: string | null) => {
  if (!iso) return '—';
  const date = new Date(iso);
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const formatSize = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

const nextSlot = (status: BackupStatus) => {
  const next = new Date(status.lastSlot);
  next.setDate(next.getDate() + 1);
  return next.toISOString();
};

const buttonStyle: React.CSSProperties = {
  flex: 1,
  background: 'var(--app-surface-elevated)',
  color: 'var(--app-muted)',
  border: '1px solid var(--app-border)',
  borderRadius: '6px',
  padding: '7px 8px',
  fontSize: '12px',
  fontWeight: 500,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  cursor: 'pointer',
};

const labelStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--app-text)', cursor: 'pointer' };

export const BackupSection: React.FC = () => {
  const [isConnected, setIsConnected] = useState(defaultAgentClient.isConnected);
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [files, setFiles] = useState<BackupFile[]>([]);
  const [autostart, setAutostart] = useState<AutostartStatus | null>(null);
  const [autoState, setAutoState] = useState<AutoBackupState>(getAutoBackupState());
  const [backupScope, setBackupScope] = useState<BackupScope>('canvas-and-data');
  const [message, setMessage] = useState('');
  const [showFiles, setShowFiles] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!defaultAgentClient.isConnected) return;
    try {
      const [nextStatus, list, nextAutostart] = await Promise.all([
        defaultAgentClient.requestJson<BackupStatus>('/backups/status'),
        defaultAgentClient.requestJson<{ items: BackupFile[] }>('/backups'),
        defaultAgentClient.requestJson<AutostartStatus>('/system/autostart'),
      ]);
      setStatus(nextStatus);
      setFiles(list.items ?? []);
      setAutostart(nextAutostart);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível consultar o agente.');
    }
  }, []);

  useEffect(() => defaultAgentClient.onStatusChange(setIsConnected), []);
  useEffect(() => subscribeAutoBackup(setAutoState), []);
  useEffect(() => {
    if (isConnected) void refresh();
  }, [isConnected, refresh]);
  // Qualquer backup gravado (por esta ou outra aba) ou mudança de agenda atualiza a seção.
  useEffect(() => defaultAgentClient.subscribe('backup:status', () => void refresh()), [refresh]);

  const updateSchedule = async (patch: { enabled?: boolean; time?: string }) => {
    try {
      setStatus(await defaultAgentClient.requestJson<BackupStatus>('/backups/settings', { method: 'PUT', body: JSON.stringify(patch) }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível salvar a agenda.');
    }
  };

  const toggleAutostart = async (enabled: boolean) => {
    try {
      setAutostart(await defaultAgentClient.requestJson<AutostartStatus>('/system/autostart', { method: 'PUT', body: JSON.stringify({ enabled }) }));
      setMessage(enabled ? 'O agente iniciará junto com a sua sessão.' : 'Início automático desativado.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível alterar o início automático.');
    }
  };

  const handleExport = async () => {
    try {
      const backup = await createDashboardBackup(backupScope);
      if (defaultAgentClient.isConnected) {
        try {
          const saved = await defaultAgentClient.saveBackup(backup, 'manual');
          setMessage(`Backup salvo em ${saved.path}`);
          return;
        } catch (agentError) {
          console.warn('[BackupSection] Agente indisponível; usando download do navegador:', agentError);
        }
      }
      const file = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = `manual-dashboard-backup-${new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-')}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage('Arquivo de recuperação exportado.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível exportar o backup.');
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const backup = JSON.parse(await file.text());
      if (!(await confirmDialog({ title: 'Importar backup', message: 'A importação substituirá o canvas atual e, se incluídos, os dados dos widgets.', confirmLabel: 'Importar', tone: 'accent' }))) return;
      await restoreDashboardBackup(backup);
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível importar o arquivo.');
    }
  };

  const handleRestore = async (file: BackupFile) => {
    if (!(await confirmDialog({ title: 'Restaurar backup', message: `Restaurar o backup de ${formatDateTime(file.createdAt)}? O estado atual será salvo antes como backup manual.`, confirmLabel: 'Restaurar', tone: 'accent' }))) return;
    setRestoring(file.name);
    try {
      const backup = await defaultAgentClient.requestJson(`/backups/files/${encodeURIComponent(file.name)}`);
      // Ponto de segurança: se a restauração não for a desejada, dá para voltar.
      const current = await createDashboardBackup('canvas-and-data');
      await defaultAgentClient.saveBackup(current, 'manual');
      await restoreDashboardBackup(backup);
      window.location.reload();
    } catch (error) {
      setRestoring(null);
      setMessage(error instanceof Error ? error.message : 'Não foi possível restaurar o backup.');
    }
  };

  const handleOpenBackupDirectory = async () => {
    try {
      const result = await defaultAgentClient.openBackupDirectory();
      setMessage(`Pasta de backups aberta: ${result.directory}`);
    } catch {
      setMessage('Inicie o agente local para abrir a pasta Dashboard Backups.');
    }
  };

  const scheduleLine = () => {
    if (!status) return '';
    if (autoState.running) return 'Fazendo backup automático…';
    if (!status.enabled) return 'Backup automático desativado.';
    if (status.due) return 'Backup pendente: será feito em instantes.';
    return `Próximo: ${formatDateTime(nextSlot(status))}`;
  };

  return (
    <div style={{ borderTop: '1px solid var(--app-border)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--app-muted-strong)', textTransform: 'uppercase' }}>Backup e recuperação</span>

      {/* Backup automático */}
      <div style={{ background: 'var(--app-surface-muted)', border: '1px solid var(--app-border)', borderRadius: '8px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {!isConnected ? (
          <span style={{ fontSize: '12px', color: 'var(--app-muted)' }}>
            O backup automático e a lista de backups precisam do agente local. Inicie-o com o start-dashboard.
          </span>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
              <label style={labelStyle}>
                <input type="checkbox" checked={status?.enabled ?? true} onChange={(event) => void updateSchedule({ enabled: event.target.checked })} />
                <Clock size={13} color="var(--app-accent)" /> Backup automático diário às
              </label>
              <input
                type="time"
                aria-label="Horário do backup automático"
                value={status?.time ?? '16:30'}
                disabled={!status?.enabled}
                onChange={(event) => event.target.value && void updateSchedule({ time: event.target.value })}
                style={{ background: 'var(--app-input)', color: 'var(--app-text)', border: '1px solid var(--app-border)', borderRadius: '6px', padding: '4px 6px', fontSize: '12px' }}
              />
            </div>
            <div style={{ fontSize: '11px', color: 'var(--app-muted)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span>Último automático: {formatDateTime(status?.lastAuto ?? null)} · {scheduleLine()}</span>
              <span>Completo (canvas + dados), mantém os {status?.keepAuto ?? 10} mais recentes.</span>
              {autoState.lastError && <span style={{ color: 'var(--app-danger)' }}>Falha no último backup automático: {autoState.lastError}</span>}
            </div>
            {autostart?.supported && (
              <label style={labelStyle} title={autostart.path ?? undefined}>
                <input type="checkbox" checked={autostart.enabled} onChange={(event) => void toggleAutostart(event.target.checked)} />
                <Power size={13} color="var(--app-accent)" /> Iniciar o agente junto com o sistema
              </label>
            )}
          </>
        )}
      </div>

      {/* Backup manual */}
      <select
        value={backupScope}
        onChange={(event) => setBackupScope(event.target.value as BackupScope)}
        style={{ background: 'var(--app-surface-elevated)', color: 'var(--app-text)', border: '1px solid var(--app-accent-border)', borderRadius: '6px', padding: '7px 9px', fontSize: '12px' }}
      >
        <option value="canvas">Somente Canvas</option>
        <option value="canvas-and-data">Canvas + Anotações</option>
      </select>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button onClick={handleExport} style={buttonStyle}>
          <Download size={14} /> Backup manual
        </button>
        <button onClick={() => document.getElementById('dashboard-backup-input')?.click()} style={buttonStyle}>
          <Upload size={14} /> Importar arquivo
        </button>
        <input id="dashboard-backup-input" type="file" accept="application/json,.json" onChange={handleImport} style={{ display: 'none' }} />
      </div>
      {isConnected && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={() => setShowFiles((value) => !value)} style={buttonStyle}>
            <History size={14} /> {showFiles ? 'Ocultar backups' : `Backups salvos (${files.length})`}
          </button>
          <button onClick={handleOpenBackupDirectory} style={{ ...buttonStyle, background: 'var(--app-accent-soft)', color: 'var(--app-accent)', borderColor: 'var(--app-accent-border)' }}>
            <HardDrive size={14} /> Abrir pasta
          </button>
        </div>
      )}

      {isConnected && showFiles && (
        <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {files.length === 0 && <span style={{ fontSize: '12px', color: 'var(--app-muted)' }}>Nenhum backup salvo ainda.</span>}
          {files.map((file) => (
            <div
              key={file.name}
              title={file.name}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 8px', borderRadius: '6px', background: 'var(--app-surface-muted)', border: '1px solid var(--app-border)', fontSize: '12px' }}
            >
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 700,
                  padding: '1px 5px',
                  borderRadius: '4px',
                  background: file.kind === 'auto' ? 'var(--app-accent-soft)' : 'var(--app-surface-elevated)',
                  color: file.kind === 'auto' ? 'var(--app-accent)' : 'var(--app-muted)',
                  minWidth: '44px',
                  textAlign: 'center',
                }}
              >
                {file.kind === 'auto' ? 'AUTO' : 'MANUAL'}
              </span>
              <span style={{ flex: 1, color: 'var(--app-text)' }}>{formatDateTime(file.createdAt)}</span>
              <span style={{ color: 'var(--app-muted)', fontSize: '11px' }}>{formatSize(file.size)}</span>
              <button
                onClick={() => void handleRestore(file)}
                disabled={restoring !== null}
                title="Restaurar este backup"
                style={{ background: 'transparent', border: 'none', color: 'var(--app-accent)', cursor: restoring ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '2px 4px' }}
              >
                <RotateCcw size={12} /> {restoring === file.name ? 'Restaurando…' : 'Restaurar'}
              </button>
            </div>
          ))}
        </div>
      )}

      {message && <span style={{ fontSize: '11px', color: 'var(--app-muted)', wordBreak: 'break-word' }}>{message}</span>}
    </div>
  );
};
