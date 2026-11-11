import React, { useCallback, useEffect, useState } from 'react';
import { Ban, CheckCircle2, Clock, Copy, ExternalLink, FolderOpen, Loader2, Save, TriangleAlert, X } from 'lucide-react';
import type { AgentClientProtocol } from '../../sdk/types';
import type { ActionTarget, WidgetMessage } from '../../sdk/actions';
import { Badge, Banner, Button, IconButton, Input } from '../../ui';

// ─────────────────────────────────────────────────────────────────────────────
// Peças comuns do Conversor e do Downloader: tipos da API /media do agente,
// fila de tarefas (com eventos `media:job` em tempo real), ferramentas
// instaladas e pasta de saída.
// ─────────────────────────────────────────────────────────────────────────────

export type JobKind = 'convert' | 'download';
export type JobStatus = 'queued' | 'running' | 'processing' | 'done' | 'error' | 'canceled';

export interface MediaOutput {
  path: string;
  name: string;
  size: number | null;
}

export interface MediaJob {
  id: string;
  kind: JobKind;
  title: string;
  summary: string;
  status: JobStatus;
  progress: number | null;
  stage: string;
  speed: number | null;
  eta: number | null;
  item: string | null;
  outputs: MediaOutput[];
  error: string | null;
  createdAt: number;
  finishedAt: number | null;
}

export type MediaCategory = 'image' | 'video' | 'audio';

export interface MediaTools {
  ffmpeg: { available: boolean; path: string | null; version: string | null };
  ffprobe: { available: boolean };
  jsRuntime: { name: string; path: string } | null;
  ytdlp: { available: boolean; version: string | null };
  hints: { ffmpeg: string; jsRuntime: string };
  platform: string;
  formats: Record<MediaCategory, { inputs: string[]; targets: string[] }>;
}

export interface MediaSettingsData {
  downloadDir: string;
  convertDir: string;
  defaultDir: string;
}

export const isActive = (job: MediaJob) => job.status === 'queued' || job.status === 'running' || job.status === 'processing';

const errorText = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

// ── Formatação ───────────────────────────────────────────────────────────────

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: value < 10 ? 1 : 0 })} ${units[unit]}`;
}

export function formatDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined || !Number.isFinite(totalSeconds)) return '';
  const seconds = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function describeJob(job: MediaJob): string {
  switch (job.status) {
    case 'queued':
      return 'Na fila';
    case 'running': {
      const parts = [job.stage || 'Em andamento'];
      if (job.item) parts[0] += ` (${job.item})`;
      if (job.progress !== null) parts.push(`${Math.floor(job.progress)}%`);
      if (job.speed) parts.push(`${formatBytes(job.speed)}/s`);
      if (job.eta !== null && job.eta !== undefined) parts.push(`${formatDuration(job.eta)} restantes`);
      return parts.join(' · ');
    }
    case 'processing':
      return `${job.stage || 'Processando'}…`;
    case 'done': {
      const size = job.outputs.reduce((sum, output) => sum + (output.size ?? 0), 0);
      const files = job.outputs.length > 1 ? `${job.outputs.length} arquivos · ` : '';
      return `Concluído · ${files}${formatBytes(size)}`;
    }
    case 'canceled':
      return 'Cancelado';
    default:
      return job.error || 'Falhou';
  }
}

// ── Hooks ────────────────────────────────────────────────────────────────────

export function useAgentReady(agentClient: AgentClientProtocol): boolean {
  const [ready, setReady] = useState(agentClient.isConnected);
  useEffect(() => agentClient.onStatusChange(setReady), [agentClient]);
  return ready;
}

export function useMediaJobs(agentClient: AgentClientProtocol, kind: JobKind, ready: boolean) {
  const [jobs, setJobs] = useState<MediaJob[]>([]);
  const [error, setError] = useState<string | null>(null);

  const upsert = useCallback(
    (job: MediaJob) => {
      if (job?.kind !== kind) return;
      setJobs((current) => {
        const index = current.findIndex((item) => item.id === job.id);
        if (index === -1) return [job, ...current];
        const next = [...current];
        next[index] = job;
        return next;
      });
    },
    [kind],
  );

  const refresh = useCallback(async () => {
    if (!agentClient.isConnected) return;
    try {
      const data = await agentClient.requestJson<{ items: MediaJob[] }>(`/media/jobs?kind=${kind}`);
      setJobs(data.items);
    } catch (err) {
      setError(errorText(err, 'Não foi possível carregar a fila.'));
    }
  }, [agentClient, kind]);

  useEffect(() => {
    if (ready) void refresh();
  }, [ready, refresh]);

  useEffect(() => agentClient.subscribe('media:job', upsert), [agentClient, upsert]);

  const call = useCallback(
    async (action: () => Promise<unknown>, fallback: string) => {
      try {
        await action();
        setError(null);
      } catch (err) {
        setError(errorText(err, fallback));
      }
    },
    [],
  );

  return {
    jobs,
    error,
    setError,
    refresh,
    add: upsert,
    cancel: (id: string) =>
      call(async () => {
        const data = await agentClient.requestJson<{ job: MediaJob }>(`/media/jobs/${id}`, { method: 'DELETE' });
        if (data?.job) upsert(data.job);
      }, 'Não foi possível cancelar.'),
    remove: (id: string) =>
      call(async () => {
        await agentClient.requestJson(`/media/jobs/${id}`, { method: 'DELETE' });
        setJobs((current) => current.filter((job) => job.id !== id));
      }, 'Não foi possível remover da lista.'),
    clearFinished: () =>
      call(async () => {
        await agentClient.requestJson(`/media/jobs?kind=${kind}`, { method: 'DELETE' });
        setJobs((current) => current.filter(isActive));
      }, 'Não foi possível limpar a lista.'),
    open: (id: string, action: 'open' | 'reveal') =>
      call(() => agentClient.requestJson(`/media/jobs/${id}/${action}`, { method: 'POST' }), 'Não foi possível abrir o arquivo.'),
  };
}

export function useMediaTools(agentClient: AgentClientProtocol, ready: boolean) {
  const [tools, setTools] = useState<MediaTools | null>(null);
  const refresh = useCallback(async () => {
    if (!agentClient.isConnected) return;
    try {
      setTools(await agentClient.requestJson<MediaTools>('/media/tools'));
    } catch {
      setTools(null);
    }
  }, [agentClient]);
  useEffect(() => {
    if (ready) void refresh();
  }, [ready, refresh]);
  return { tools, refresh };
}

export function useMediaSettings(agentClient: AgentClientProtocol, ready: boolean) {
  const [settings, setSettings] = useState<MediaSettingsData | null>(null);
  useEffect(() => {
    if (!ready) return;
    agentClient
      .requestJson<MediaSettingsData>('/media/settings')
      .then(setSettings)
      .catch(() => setSettings(null));
  }, [agentClient, ready]);
  const save = useCallback(
    async (patch: Partial<Pick<MediaSettingsData, 'downloadDir' | 'convertDir'>>) => {
      const next = await agentClient.requestJson<MediaSettingsData>('/media/settings', { method: 'PUT', body: JSON.stringify(patch) });
      setSettings(next);
      return next;
    },
    [agentClient],
  );
  const openDirectory = useCallback(
    (which: 'download' | 'convert') => agentClient.requestJson('/media/open-directory', { method: 'POST', body: JSON.stringify({ which }) }),
    [agentClient],
  );
  return { settings, save, openDirectory };
}

/** Arquivos gerados por uma tarefa, como mensagens do "Enviar para…". O Conversor recebe um por vez (o primeiro). */
export function outputMessages(job: MediaJob, target: ActionTarget): WidgetMessage[] {
  const outputs = target.widgetId === 'file-converter' ? job.outputs.slice(0, 1) : job.outputs;
  return outputs.map((output) => ({ kind: 'file', path: output.path, name: output.name }));
}

// ── Componentes ──────────────────────────────────────────────────────────────

export function ProgressBar({ value, label }: { value: number | null; label: string }) {
  const indeterminate = value === null;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(value)}
      style={{ height: '4px', borderRadius: '2px', background: 'var(--app-border)', overflow: 'hidden', flexShrink: 0 }}
    >
      <div
        className={indeterminate ? 'progress-indeterminate' : undefined}
        style={{
          height: '100%',
          width: indeterminate ? '40%' : `${Math.max(2, Math.min(100, value))}%`,
          background: 'var(--widget-accent)',
          borderRadius: '2px',
          transition: indeterminate ? undefined : 'width 0.3s ease',
        }}
      />
    </div>
  );
}

const statusIcon = (job: MediaJob) => {
  if (job.status === 'done') return <CheckCircle2 size={13} color="var(--app-success)" />;
  if (job.status === 'error') return <TriangleAlert size={13} color="var(--app-danger)" />;
  if (job.status === 'canceled') return <Ban size={13} color="var(--app-muted)" />;
  if (job.status === 'queued') return <Clock size={13} color="var(--app-muted)" />;
  return <Loader2 size={13} className="spin" color="var(--widget-accent)" />;
};

export function MediaJobList({
  jobs,
  emptyText,
  onCancel,
  onRemove,
  onOpen,
  onClearFinished,
  renderDoneActions,
}: {
  jobs: MediaJob[];
  emptyText: string;
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
  onOpen: (id: string, action: 'open' | 'reveal') => void;
  onClearFinished: () => void;
  /** Ações extras de uma tarefa concluída (ex.: "Enviar para…"). */
  renderDoneActions?: (job: MediaJob) => React.ReactNode;
}) {
  const finished = jobs.filter((job) => !isActive(job)).length;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', minHeight: 0 }}>
      {jobs.length === 0 && (
        <div style={{ fontSize: 'var(--font-sm)', color: 'var(--app-muted)', border: '1px dashed var(--app-border)', borderRadius: 'var(--radius-lg)', padding: '10px' }}>
          {emptyText}
        </div>
      )}
      {jobs.map((job) => (
        <div
          key={job.id}
          data-testid="media-job"
          style={{
            background: 'var(--app-surface-muted)',
            border: `1px solid ${job.status === 'error' ? 'var(--app-danger)' : 'var(--app-border)'}`,
            borderRadius: 'var(--radius-lg)',
            padding: '6px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
            <span style={{ display: 'flex', flexShrink: 0 }}>{statusIcon(job)}</span>
            <span
              title={job.outputs[0]?.path ?? job.title}
              style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 'var(--font-md)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {job.status === 'done' && job.outputs.length === 1 ? job.outputs[0].name : job.title}
            </span>
            {job.status === 'done' && job.outputs.length > 0 && (
              <>
                {renderDoneActions?.(job)}
                <IconButton label="Abrir arquivo" onClick={() => onOpen(job.id, 'open')} icon={<ExternalLink size={12} />} style={{ padding: '2px' }} />
                <IconButton label="Mostrar na pasta" onClick={() => onOpen(job.id, 'reveal')} icon={<FolderOpen size={12} />} style={{ padding: '2px' }} />
              </>
            )}
            {isActive(job) ? (
              <IconButton label="Cancelar" tone="danger" onClick={() => onCancel(job.id)} icon={<X size={12} />} style={{ padding: '2px' }} />
            ) : (
              <IconButton label="Remover da lista" onClick={() => onRemove(job.id)} icon={<X size={12} />} style={{ padding: '2px' }} />
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, fontSize: 'var(--font-xs)' }}>
            {job.summary && <Badge tone="neutral">{job.summary}</Badge>}
            <span
              title={describeJob(job)}
              style={{
                color: job.status === 'error' ? 'var(--app-danger)' : 'var(--app-muted)',
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: job.status === 'error' ? 'normal' : 'nowrap',
              }}
            >
              {describeJob(job)}
            </span>
          </div>
          {(job.status === 'running' || job.status === 'processing') && (
            <ProgressBar value={job.status === 'processing' ? null : job.progress} label={`Progresso de ${job.title}`} />
          )}
        </div>
      ))}
      {finished > 1 && (
        <Button variant="ghost" onClick={onClearFinished} style={{ alignSelf: 'flex-end', padding: '2px 6px', fontSize: 'var(--font-xs)' }}>
          Limpar concluídos
        </Button>
      )}
    </div>
  );
}

/** Aviso de ferramenta ausente com o comando de instalação e botão de copiar. */
export function InstallHint({ tone = 'warning', children, command }: { tone?: 'warning' | 'accent'; children: React.ReactNode; command: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Sem permissão de área de transferência: o comando continua visível para copiar à mão.
    }
  };
  return (
    <Banner tone={tone}>
      <span style={{ display: 'block' }}>{children}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px' }}>
        <code
          style={{
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 'var(--font-xs)',
            background: 'var(--app-surface)',
            border: '1px solid var(--app-border)',
            borderRadius: 'var(--radius-sm)',
            padding: '1px 5px',
            color: 'var(--app-text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
          }}
        >
          {command}
        </code>
        <IconButton label={copied ? 'Copiado!' : 'Copiar comando'} onClick={copy} icon={copied ? <CheckCircle2 size={12} /> : <Copy size={12} />} style={{ padding: '1px', color: 'inherit' }} />
      </span>
    </Banner>
  );
}

/** Pasta de saída: mostrar, abrir, trocar (vazio volta ao padrão). */
export function OutputFolderSetting({
  id,
  label,
  value,
  defaultDir,
  onSave,
  onOpen,
}: {
  id: string;
  label: string;
  value: string;
  defaultDir: string;
  onSave: (next: string) => Promise<unknown>;
  onOpen: () => Promise<unknown>;
}) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => setDraft(value), [value]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await onSave(draft);
      setError(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setError(errorText(err, 'Não foi possível salvar a pasta.'));
    }
  };

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <label htmlFor={id} style={{ fontSize: 'var(--font-xs)', color: 'var(--app-muted)' }}>
        {label}
      </label>
      <div style={{ display: 'flex', gap: '4px' }}>
        <Input id={id} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={defaultDir} style={{ flex: 1, fontSize: 'var(--font-sm)', padding: '4px 6px' }} />
        <IconButton type="submit" label={saved ? 'Pasta salva' : 'Salvar pasta'} bordered icon={saved ? <CheckCircle2 size={12} /> : <Save size={12} />} disabled={draft === value} />
        <IconButton label="Abrir pasta" bordered onClick={() => void onOpen().catch((err) => setError(errorText(err, 'Não foi possível abrir a pasta.')))} icon={<FolderOpen size={12} />} />
      </div>
      {error && <span style={{ fontSize: 'var(--font-xs)', color: 'var(--app-danger)' }}>{error}</span>}
      <span style={{ fontSize: 'var(--font-xs)', color: 'var(--app-muted-strong)' }}>Deixe vazio para usar o padrão ({defaultDir}).</span>
    </form>
  );
}

/** Caixa de seleção com rótulo, no estilo dos widgets. */
export function CheckboxField({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label
      title={hint}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: 'var(--font-sm)',
        color: disabled ? 'var(--app-muted-strong)' : 'var(--app-text)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        minWidth: 0,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        style={{ accentColor: 'var(--widget-accent)', margin: 0, flexShrink: 0 }}
      />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </label>
  );
}
