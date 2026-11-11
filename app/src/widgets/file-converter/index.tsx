import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FileCog, FolderOpen, Layers, Minimize2, Repeat, Settings2, UploadCloud, WifiOff, X } from 'lucide-react';
import type { WidgetComponentProps, WidgetDefinition } from '../../sdk/types';
import { Banner, Button, FieldLabel, IconButton, SegmentedControl, Select, Spacer, Toolbar } from '../../ui';
import { SendToButton } from '../../ui/SendTo';
import { showToast } from '../../ui/toast';
import { useActionReceiver } from '../../sdk/actions';
import {
  InstallHint,
  MediaCategory,
  MediaJob,
  MediaJobList,
  outputMessages,
  OutputFolderSetting,
  ProgressBar,
  formatBytes,
  formatDuration,
  useAgentReady,
  useMediaJobs,
  useMediaSettings,
  useMediaTools,
} from '../media-common';

// ─────────────────────────────────────────────────────────────────────────────
// Conversor de Arquivos — imagens, vídeos e áudios.
//
// Com o agente: o arquivo é enviado por HTTP em pedaços (sem base64, sem limite
// de memória) e entra na fila do agente, que converte com Pillow (imagens) ou
// ffmpeg (vídeo/áudio) e salva na pasta de saída (padrão ~/Downloads/Dashboard).
// Sem o agente: imagens PNG/JPG/WebP ainda são convertidas no navegador.
// ─────────────────────────────────────────────────────────────────────────────

type Mode = 'convert' | 'compress' | 'both';
type Level = 'low' | 'medium' | 'high';
type Resolution = 'original' | '2160p' | '1440p' | '1080p' | '720p' | '480p' | '360p';

interface ConverterOptions {
  mode: Mode;
  level: Level;
  resolution: Resolution;
  targets: Partial<Record<MediaCategory, string>>;
}

const DEFAULT_OPTIONS: ConverterOptions = {
  mode: 'convert',
  level: 'medium',
  resolution: 'original',
  targets: { image: 'jpg', video: 'mp4', audio: 'mp3' },
};

// Mesma lista do agente; usada antes de /media/tools responder ou sem o agente.
const FALLBACK_FORMATS: Record<MediaCategory, { inputs: string[]; targets: string[] }> = {
  image: { inputs: ['bmp', 'gif', 'ico', 'jfif', 'jpeg', 'jpg', 'png', 'tif', 'tiff', 'webp'], targets: ['png', 'jpg', 'webp', 'bmp', 'gif', 'tiff', 'ico'] },
  video: {
    inputs: ['3gp', 'avi', 'flv', 'm2ts', 'm4v', 'mkv', 'mov', 'mp4', 'mpeg', 'mpg', 'mts', 'ogv', 'ts', 'webm', 'wmv'],
    targets: ['mp4', 'mkv', 'webm', 'mov', 'avi', 'mpeg', 'mp3', 'm4a', 'aac', 'ogg', 'opus', 'wav', 'flac'],
  },
  audio: { inputs: ['aac', 'aif', 'aiff', 'amr', 'flac', 'm4a', 'mp3', 'oga', 'ogg', 'opus', 'wav', 'wma'], targets: ['mp3', 'm4a', 'aac', 'ogg', 'opus', 'wav', 'flac'] },
};
const VIDEO_TARGETS = ['mp4', 'mkv', 'webm', 'mov', 'avi', 'mpeg'];
const BROWSER_TARGETS = ['png', 'jpg', 'webp'];

const MODES = [
  { id: 'convert' as const, label: 'Converter', icon: <Repeat size={12} /> },
  { id: 'compress' as const, label: 'Compactar', icon: <Minimize2 size={12} /> },
  { id: 'both' as const, label: 'Ambos', icon: <Layers size={12} /> },
];
const LEVELS: { id: Level; label: string }[] = [
  { id: 'low', label: 'Leve (melhor qualidade)' },
  { id: 'medium', label: 'Média' },
  { id: 'high', label: 'Alta (menor arquivo)' },
];
const RESOLUTIONS: Resolution[] = ['original', '2160p', '1440p', '1080p', '720p', '480p', '360p'];
const CATEGORY_LABEL: Record<MediaCategory, string> = { image: 'Imagem', video: 'Vídeo', audio: 'Áudio' };

const extensionOf = (name: string) => (name.includes('.') ? name.split('.').pop()!.toLowerCase() : '');

function categoryOf(name: string, formats: Record<MediaCategory, { inputs: string[] }>): MediaCategory | null {
  const ext = extensionOf(name);
  return (Object.keys(formats) as MediaCategory[]).find((category) => formats[category].inputs.includes(ext)) ?? null;
}

/** Dimensões/duração lidas pelo navegador (desiste em 2 s: alguns formatos ele não abre). */
function readMediaInfo(file: File, category: MediaCategory): Promise<string[]> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    let done = false;
    const finish = (info: string[]) => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(url);
      resolve(info);
    };
    setTimeout(() => finish([]), 2000);
    if (category === 'image') {
      const image = new Image();
      image.onload = () => finish([`${image.naturalWidth} × ${image.naturalHeight}px`]);
      image.onerror = () => finish([]);
      image.src = url;
      return;
    }
    const element = document.createElement(category === 'video' ? 'video' : 'audio');
    element.preload = 'metadata';
    element.onloadedmetadata = () => {
      const info = [formatDuration(element.duration)];
      if (element instanceof HTMLVideoElement && element.videoWidth) info.push(`${element.videoWidth} × ${element.videoHeight}px`);
      finish(info.filter(Boolean));
    };
    element.onerror = () => finish([]);
    element.src = url;
  });
}

const BROWSER_QUALITY: Record<'convert' | Level, number> = { convert: 0.92, low: 0.85, medium: 0.72, high: 0.55 };

async function convertImageInBrowser(file: File, target: string, quality: number): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('O navegador não conseguiu abrir esta imagem.'));
      element.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas indisponível neste navegador.');
    if (target === 'jpg') {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(image, 0, 0);
    const mime = `image/${target === 'jpg' ? 'jpeg' : target}`;
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Falha ao gerar a imagem.'))), mime, target === 'png' ? undefined : quality),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const FileConverterWidget: React.FC<WidgetComponentProps> = ({ context }) => {
  const { agentClient, storage, dimensions, instanceId } = context;
  const isCompact = dimensions.width > 0 && dimensions.width < 330;
  const ready = useAgentReady(agentClient);
  const { tools } = useMediaTools(agentClient, ready);
  const jobsApi = useMediaJobs(agentClient, 'convert', ready);
  const { settings, save, openDirectory } = useMediaSettings(agentClient, ready);

  const [options, setOptions] = useState<ConverterOptions>(DEFAULT_OPTIONS);
  const [isLoaded, setIsLoaded] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  // Arquivo que já está no computador, enviado por outro widget (Downloader, Top 10).
  const [remote, setRemote] = useState<{ path: string; name: string } | null>(null);
  const [fileInfo, setFileInfo] = useState<string[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [uploadFraction, setUploadFraction] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    storage.get<ConverterOptions>('options').then((saved) => {
      if (saved) setOptions({ ...DEFAULT_OPTIONS, ...saved, targets: { ...DEFAULT_OPTIONS.targets, ...saved.targets } });
      setIsLoaded(true);
    });
  }, [storage]);

  useEffect(() => {
    if (isLoaded) void storage.set('options', options);
  }, [isLoaded, options, storage]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const formats = tools?.formats ?? FALLBACK_FORMATS;
  const sourceName = file?.name ?? remote?.name ?? '';
  const category = sourceName ? categoryOf(sourceName, formats) : null;
  const browserMode = !ready && category === 'image' && !!file;
  const targets = category ? (browserMode ? BROWSER_TARGETS : formats[category].targets) : [];
  const savedTarget = category ? options.targets[category] : undefined;
  const target = savedTarget && targets.includes(savedTarget) ? savedTarget : targets[0] ?? '';
  const ffmpegMissing = ready && !!tools && !tools.ffmpeg.available && (category === 'video' || category === 'audio');
  const showResolution = category === 'video' && VIDEO_TARGETS.includes(options.mode === 'compress' ? extensionOf(sourceName) : target) && !browserMode;
  const isUploading = uploadFraction !== null;
  const canConvert = !!sourceName && !!category && !isUploading && !ffmpegMissing && (ready || browserMode);

  const update = (patch: Partial<ConverterOptions>) => setOptions((current) => ({ ...current, ...patch }));

  const pickFile = useCallback((next: File | null) => {
    setFile(next);
    setRemote(null);
    setFileInfo([]);
    setError(null);
    setNotice(null);
  }, []);

  // "Enviar para…": arquivo gerado pelo Downloader ou listado no Top 10.
  useActionReceiver(context.actions, (message) => {
    if (message.kind !== 'file') return;
    if (uploadFraction !== null) {
      showToast('O Conversor está enviando outro arquivo; tente de novo quando terminar.', 'danger');
      return;
    }
    setFile(null);
    setFileInfo([]);
    setError(null);
    setNotice(null);
    setRemote({ path: message.path, name: message.name });
  });

  useEffect(() => {
    if (!file || !category) return;
    let active = true;
    void readMediaInfo(file, category).then((info) => active && setFileInfo(info));
    return () => {
      active = false;
    };
  }, [file, category]);

  const convert = async () => {
    if (!sourceName || !category) return;
    setError(null);
    setNotice(null);
    const outputFormat = options.mode === 'compress' ? extensionOf(sourceName).replace('jpeg', 'jpg') : target;

    if (remote) {
      try {
        const job = await agentClient.requestJson<MediaJob>('/media/convert-file', {
          method: 'POST',
          body: JSON.stringify({
            path: remote.path,
            options: { mode: options.mode, level: options.level, resolution: showResolution ? options.resolution : 'original', ...(options.mode !== 'compress' ? { targetFormat: target } : {}) },
          }),
        });
        jobsApi.add(job);
        pickFile(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Não foi possível converter o arquivo.');
      }
      return;
    }
    if (!file) return;

    if (browserMode) {
      if (!BROWSER_TARGETS.includes(outputFormat)) {
        setError('Sem o agente, só dá para gerar PNG, JPG ou WebP.');
        return;
      }
      try {
        const blob = await convertImageInBrowser(file, outputFormat, BROWSER_QUALITY[options.mode === 'convert' ? 'convert' : options.level]);
        const name = `${file.name.replace(/\.[^.]+$/, '')}_${options.mode === 'compress' ? 'compactado' : 'convertido'}.${outputFormat}`;
        downloadBlob(blob, name);
        setNotice(`Baixado pelo navegador: ${name} (${formatBytes(blob.size)})`);
        pickFile(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha ao converter no navegador.');
      }
      return;
    }

    if (!agentClient.upload) {
      setError('Este cliente do agente não suporta envio de arquivos.');
      return;
    }
    const params = new URLSearchParams({ fileName: file.name, mode: options.mode, level: options.level, resolution: showResolution ? options.resolution : 'original' });
    if (options.mode !== 'compress') params.set('targetFormat', target);
    const controller = new AbortController();
    abortRef.current = controller;
    setUploadFraction(0);
    try {
      const job = await agentClient.upload<MediaJob>(`/media/convert?${params}`, file, { onProgress: setUploadFraction, signal: controller.signal });
      jobsApi.add(job);
      pickFile(null);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setError(err instanceof Error ? err.message : 'Não foi possível enviar o arquivo.');
      }
    } finally {
      abortRef.current = null;
      setUploadFraction(null);
    }
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) pickFile(dropped);
  };

  const actionLabel = options.mode === 'convert' ? 'Converter arquivo' : options.mode === 'compress' ? 'Compactar arquivo' : 'Converter e compactar';
  const fieldId = (name: string) => `${instanceId}-conv-${name}`;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '8px', color: 'var(--app-text)', fontSize: '12px', minHeight: 0 }}>
      <Toolbar>
        <span style={{ fontSize: 'var(--font-xs)', color: 'var(--app-muted)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={settings?.convertDir}>
          {ready ? (settings ? `Salva em ${settings.convertDir}` : '') : 'Agente offline'}
        </span>
        <Spacer />
        {ready && (
          <>
            <IconButton label="Abrir pasta de saída" bordered onClick={() => void openDirectory('convert').catch((err) => setError(err.message))} icon={<FolderOpen size={12} />} />
            <IconButton label="Configurações do conversor" bordered active={showSettings} onClick={() => setShowSettings((value) => !value)} icon={<Settings2 size={12} />} />
          </>
        )}
      </Toolbar>

      {showSettings && ready && settings && (
        <div style={{ background: 'var(--app-surface-muted)', border: '1px solid var(--app-border)', borderRadius: 'var(--radius-lg)', padding: '8px', flexShrink: 0 }}>
          <OutputFolderSetting
            id={fieldId('folder')}
            label="Pasta dos arquivos convertidos"
            value={settings.convertDir}
            defaultDir={settings.defaultDir}
            onSave={(next) => save({ convertDir: next })}
            onOpen={() => openDirectory('convert')}
          />
        </div>
      )}

      {error && <Banner onClose={() => setError(null)}>{error}</Banner>}
      {jobsApi.error && <Banner onClose={() => jobsApi.setError(null)}>{jobsApi.error}</Banner>}
      {notice && (
        <Banner tone="success" onClose={() => setNotice(null)}>
          {notice}
        </Banner>
      )}
      {!ready && (
        <Banner tone="warning" icon={<WifiOff size={13} />}>
          Agente offline: só imagens (PNG, JPG, WebP), convertidas no navegador. Inicie o agente para vídeo e áudio.
        </Banner>
      )}

      {!sourceName ? (
        <div
          data-testid="drop-zone"
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={onDrop}
          style={{
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '14px 8px',
            textAlign: 'center',
            borderRadius: 'var(--radius-lg)',
            border: `2px dashed ${dragActive ? 'var(--widget-accent)' : 'var(--app-border)'}`,
            background: dragActive ? 'var(--widget-accent-soft)' : 'transparent',
            color: 'var(--app-muted)',
          }}
        >
          <UploadCloud size={24} />
          <span>Arraste uma imagem, vídeo ou áudio aqui</span>
          <Button variant="primary" onClick={() => inputRef.current?.click()}>
            Selecionar arquivo
          </Button>
          <input
            ref={inputRef}
            type="file"
            aria-label="Arquivo para converter"
            style={{ display: 'none' }}
            onChange={(event) => {
              pickFile(event.target.files?.[0] ?? null);
              event.target.value = '';
            }}
          />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--app-surface-muted)', border: '1px solid var(--app-border)', borderRadius: 'var(--radius-lg)', padding: '6px 8px' }}
          >
            <FileCog size={16} color="var(--widget-accent)" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div title={remote?.path ?? sourceName} style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {sourceName}
              </div>
              <div style={{ fontSize: 'var(--font-xs)', color: 'var(--app-muted)' }}>
                {[category ? CATEGORY_LABEL[category] : 'Formato desconhecido', file ? formatBytes(file.size) : 'Arquivo do computador', ...fileInfo].filter(Boolean).join(' · ')}
              </div>
            </div>
            <IconButton label="Trocar arquivo" onClick={() => pickFile(null)} disabled={isUploading} icon={<X size={13} />} />
          </div>

          {!category ? (
            <Banner tone="warning">Formato .{extensionOf(sourceName) || '?'} não suportado. Use imagens, vídeos ou áudios.</Banner>
          ) : (
            <>
              <SegmentedControl ariaLabel="Modo" stretch compact={isCompact} value={options.mode} onChange={(mode) => update({ mode })} options={MODES} disabled={isUploading} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '6px' }}>
                {options.mode !== 'compress' && (
                  <div>
                    <FieldLabel htmlFor={fieldId('format')}>Formato de saída</FieldLabel>
                    <Select
                      id={fieldId('format')}
                      value={target}
                      disabled={isUploading}
                      onChange={(event) => update({ targets: { ...options.targets, [category]: event.target.value } })}
                      style={{ width: '100%' }}
                    >
                      {targets.map((format) => (
                        <option key={format} value={format}>
                          {format.toUpperCase()}
                          {category === 'video' && !VIDEO_TARGETS.includes(format) ? ' (só áudio)' : ''}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
                {options.mode !== 'convert' && (
                  <div>
                    <FieldLabel htmlFor={fieldId('level')}>Compactação</FieldLabel>
                    <Select id={fieldId('level')} value={options.level} disabled={isUploading} onChange={(event) => update({ level: event.target.value as Level })} style={{ width: '100%' }}>
                      {LEVELS.map((level) => (
                        <option key={level.id} value={level.id}>
                          {level.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
                {showResolution && (
                  <div>
                    <FieldLabel htmlFor={fieldId('resolution')}>Resolução máxima</FieldLabel>
                    <Select
                      id={fieldId('resolution')}
                      value={options.resolution}
                      disabled={isUploading}
                      onChange={(event) => update({ resolution: event.target.value as Resolution })}
                      style={{ width: '100%' }}
                    >
                      {RESOLUTIONS.map((resolution) => (
                        <option key={resolution} value={resolution}>
                          {resolution === 'original' ? 'Original' : resolution}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
              </div>

              {ffmpegMissing && tools && (
                <InstallHint command={tools.hints.ffmpeg}>ffmpeg não encontrado — necessário para vídeo e áudio. Instale e clique em Converter de novo:</InstallHint>
              )}

              {isUploading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--font-sm)', color: 'var(--app-muted)' }}>
                    <span style={{ flex: 1 }}>Enviando ao agente… {Math.floor((uploadFraction ?? 0) * 100)}%</span>
                    <Button variant="danger" onClick={() => abortRef.current?.abort()}>
                      Cancelar envio
                    </Button>
                  </div>
                  <ProgressBar value={(uploadFraction ?? 0) * 100} label="Envio do arquivo" />
                </div>
              ) : (
                <Button variant="primary" size="md" block icon={<FileCog size={14} />} disabled={!canConvert} onClick={() => void convert()}>
                  {actionLabel}
                </Button>
              )}
            </>
          )}
        </div>
      )}

      {ready && (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <MediaJobList
            jobs={jobsApi.jobs}
            emptyText="Os arquivos convertidos aparecem aqui."
            onCancel={(id) => void jobsApi.cancel(id)}
            onRemove={(id) => void jobsApi.remove(id)}
            onOpen={(id, action) => void jobsApi.open(id, action)}
            onClearFinished={() => void jobsApi.clearFinished()}
            renderDoneActions={(job) => (
              <SendToButton actions={context.actions} kinds={['file']} iconOnly label="Enviar arquivo para…" build={(target) => outputMessages(job, target)} style={{ padding: '2px' }} />
            )}
          />
        </div>
      )}
    </div>
  );
};

export const fileConverterWidget: WidgetDefinition = {
  manifest: {
    id: 'file-converter',
    name: 'Conversor de Arquivos',
    version: '2.1.0',
    description: 'Converte e compacta imagens, vídeos e áudios (ffmpeg), com fila, progresso e pasta de saída.',
    icon: 'FileCog',
    author: 'Dashboard Core',
    status: 'stable',
    defaultSize: { w: 4, h: 7 },
    minSize: { w: 3, h: 3 },
    maxSize: { w: 8, h: 12 },
    requiresAgent: true,
    accepts: ['file'],
  },
  component: FileConverterWidget,
};
