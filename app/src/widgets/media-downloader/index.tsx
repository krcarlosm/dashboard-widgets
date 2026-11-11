import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Download, Film, FolderOpen, ListVideo, Loader2, Music, RefreshCw, Settings2, Video } from 'lucide-react';
import type { WidgetComponentProps, WidgetDefinition } from '../../sdk/types';
import { AgentOfflineBanner, Badge, Banner, Button, FieldLabel, IconButton, Input, SegmentedControl, Select, Spacer, Toolbar } from '../../ui';
import { SendToButton } from '../../ui/SendTo';
import { useActionReceiver } from '../../sdk/actions';
import {
  CheckboxField,
  InstallHint,
  MediaJob,
  MediaJobList,
  outputMessages,
  OutputFolderSetting,
  formatDuration,
  useAgentReady,
  useMediaJobs,
  useMediaSettings,
  useMediaTools,
} from '../media-common';

// ─────────────────────────────────────────────────────────────────────────────
// Downloader de vídeos e áudios (yt-dlp, executado pelo agente local).
//
// Cole um link: o widget mostra título, duração e miniatura. No modo simples
// escolhe-se vídeo+áudio / só áudio / só vídeo, formato e qualidade; o modo
// avançado expõe opções do yt-dlp (playlist, legendas, miniatura, capítulos,
// SponsorBlock, limite de velocidade, nome do arquivo, trecho). O agente só
// aceita essas opções — nunca argumentos livres.
// ─────────────────────────────────────────────────────────────────────────────

type DownloadMode = 'video' | 'audio' | 'videoonly';

export interface DownloadOptions {
  mode: DownloadMode;
  videoFormat: 'mp4' | 'mkv' | 'webm';
  audioFormat: 'mp3' | 'm4a' | 'opus' | 'wav' | 'flac';
  quality: 'best' | '2160' | '1440' | '1080' | '720' | '480' | '360' | '240';
  audioQuality: 'best' | '320' | '192' | '128';
  playlist: boolean;
  subtitles: boolean;
  autoSubtitles: boolean;
  subLangs: 'pt' | 'en' | 'pt,en' | 'all';
  embedThumbnail: boolean;
  embedMetadata: boolean;
  embedChapters: boolean;
  sponsorBlock: boolean;
  rateLimit: '' | '500K' | '1M' | '2M' | '5M' | '10M';
  filenameTemplate: 'title' | 'uploader-title' | 'date-title' | 'index-title';
  restrictFilenames: boolean;
  sectionStart: string;
  sectionEnd: string;
}

export const DEFAULT_DOWNLOAD_OPTIONS: DownloadOptions = {
  mode: 'video',
  videoFormat: 'mp4',
  audioFormat: 'mp3',
  quality: 'best',
  audioQuality: 'best',
  playlist: false,
  subtitles: false,
  autoSubtitles: false,
  subLangs: 'pt,en',
  embedThumbnail: false,
  embedMetadata: true,
  embedChapters: false,
  sponsorBlock: false,
  rateLimit: '',
  filenameTemplate: 'title',
  restrictFilenames: false,
  sectionStart: '',
  sectionEnd: '',
};

interface PreviewData {
  kind: 'video' | 'playlist';
  url: string;
  title: string;
  uploader: string | null;
  duration: number | null;
  thumbnail: string | null;
  heights?: number[];
  count?: number;
  isLive?: boolean;
  extractor?: string;
}

const MODES = [
  { id: 'video' as const, label: 'Vídeo + áudio', icon: <Film size={12} /> },
  { id: 'audio' as const, label: 'Só áudio', icon: <Music size={12} /> },
  { id: 'videoonly' as const, label: 'Só vídeo', icon: <Video size={12} /> },
];
const QUALITIES = ['2160', '1440', '1080', '720', '480', '360', '240'] as const;
const TIME_PATTERN = /^\d{1,2}(:\d{2}){0,2}$/;
const PREVIEW_DELAY_MS = 700;

export const isValidUrl = (value: string) => {
  try {
    const url = new URL(value.trim());
    return (url.protocol === 'http:' || url.protocol === 'https:') && !/\s/.test(value.trim());
  } catch {
    return false;
  }
};

const MediaDownloaderWidget: React.FC<WidgetComponentProps> = ({ context }) => {
  const { agentClient, storage, dimensions, instanceId } = context;
  const isCompact = dimensions.width > 0 && dimensions.width < 330;
  const ready = useAgentReady(agentClient);
  const { tools, refresh: refreshTools } = useMediaTools(agentClient, ready);
  const jobsApi = useMediaJobs(agentClient, 'download', ready);
  const { settings, save, openDirectory } = useMediaSettings(agentClient, ready);

  const [options, setOptions] = useState<DownloadOptions>(DEFAULT_DOWNLOAD_OPTIONS);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [url, setUrl] = useState('');
  // Link enviado por outro widget (ex.: copiado no Baú): preenche o campo e busca a prévia.
  useActionReceiver(context.actions, (message) => {
    if (message.kind === 'url') setUrl(message.url);
  });
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [updateState, setUpdateState] = useState<{ running: boolean; message?: string; tone?: 'success' | 'danger' }>({ running: false });
  const previewSeq = useRef(0);

  useEffect(() => {
    Promise.all([storage.get<Partial<DownloadOptions>>('options'), storage.get<boolean>('showAdvanced')]).then(([saved, advanced]) => {
      if (saved) setOptions({ ...DEFAULT_DOWNLOAD_OPTIONS, ...saved, sectionStart: '', sectionEnd: '' });
      if (advanced) setShowAdvanced(true);
      setIsLoaded(true);
    });
  }, [storage]);

  useEffect(() => {
    if (!isLoaded) return;
    // O trecho vale só para o link atual; não fica salvo.
    const { sectionStart, sectionEnd, ...persistent } = options;
    void storage.set('options', persistent);
  }, [isLoaded, options, storage]);

  useEffect(() => {
    if (isLoaded) void storage.set('showAdvanced', showAdvanced);
  }, [isLoaded, showAdvanced, storage]);

  const trimmedUrl = url.trim();
  const urlIsValid = isValidUrl(trimmedUrl);

  // Pré-visualização automática (com atraso) ao colar/digitar o link.
  useEffect(() => {
    const seq = ++previewSeq.current;
    setPreview(null);
    setPreviewError(null);
    if (!ready || !urlIsValid) {
      setIsPreviewing(false);
      return;
    }
    setIsPreviewing(true);
    const timer = setTimeout(async () => {
      try {
        const data = await agentClient.requestJson<PreviewData>('/media/download/preview', {
          method: 'POST',
          body: JSON.stringify({ url: trimmedUrl, playlist: options.playlist }),
        });
        if (seq === previewSeq.current) setPreview(data);
      } catch (err) {
        if (seq === previewSeq.current) setPreviewError(err instanceof Error ? err.message : 'Não foi possível ler o link.');
      } finally {
        if (seq === previewSeq.current) setIsPreviewing(false);
      }
    }, PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [agentClient, ready, trimmedUrl, urlIsValid, options.playlist]);

  const update = (patch: Partial<DownloadOptions>) => setOptions((current) => ({ ...current, ...patch }));

  const maxHeight = preview?.kind === 'video' && preview.heights?.length ? preview.heights[0] : null;
  const qualities = QUALITIES.filter((quality) => maxHeight === null || Number(quality) <= maxHeight);
  const sectionInvalid = [options.sectionStart, options.sectionEnd].some((value) => value.trim() && !TIME_PATTERN.test(value.trim()));
  const ytdlpMissing = !!tools && !tools.ytdlp.available;
  const canDownload = ready && urlIsValid && !isSubmitting && !sectionInvalid && !ytdlpMissing;

  const startDownload = async () => {
    if (!canDownload) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const job = await agentClient.requestJson<MediaJob>('/media/download', {
        method: 'POST',
        body: JSON.stringify({
          url: trimmedUrl,
          title: preview?.title,
          options: { ...options, quality: qualities.includes(options.quality as any) || options.quality === 'best' ? options.quality : 'best' },
        }),
      });
      jobsApi.add(job);
      setUrl('');
      update({ sectionStart: '', sectionEnd: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível iniciar o download.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateYtdlp = async () => {
    setUpdateState({ running: true });
    try {
      const result = await agentClient.requestJson<{ before: string; after: string; updated: boolean }>('/media/ytdlp/update', { method: 'POST' });
      setUpdateState({
        running: false,
        tone: 'success',
        message: result.updated ? `yt-dlp atualizado: ${result.before} → ${result.after}.` : `O yt-dlp já está na versão mais recente (${result.after}).`,
      });
      void refreshTools();
    } catch (err) {
      setUpdateState({ running: false, tone: 'danger', message: err instanceof Error ? err.message : 'Falha ao atualizar.' });
    }
  };

  if (!ready) {
    return <AgentOfflineBanner what="baixar vídeos e áudios" />;
  }

  const fieldId = (name: string) => `${instanceId}-dl-${name}`;
  const isAudio = options.mode === 'audio';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '8px', color: 'var(--app-text)', fontSize: '12px', minHeight: 0 }}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void startDownload();
        }}
        style={{ display: 'flex', gap: '6px', flexShrink: 0 }}
      >
        <Input
          aria-label="Link do vídeo"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="Cole o link (YouTube, Vimeo, Instagram…)"
          style={{ flex: 1, fontSize: 'var(--font-sm)' }}
        />
        <IconButton label="Abrir pasta de downloads" bordered onClick={() => void openDirectory('download').catch((err) => setError(err.message))} icon={<FolderOpen size={12} />} />
        <IconButton label="Configurações do downloader" bordered active={showSettings} onClick={() => setShowSettings((value) => !value)} icon={<Settings2 size={12} />} />
      </form>

      {showSettings && (
        <div style={{ background: 'var(--app-surface-muted)', border: '1px solid var(--app-border)', borderRadius: 'var(--radius-lg)', padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
          {settings && (
            <OutputFolderSetting
              id={fieldId('folder')}
              label="Pasta de destino"
              value={settings.downloadDir}
              defaultDir={settings.defaultDir}
              onSave={(next) => save({ downloadDir: next })}
              onOpen={() => openDirectory('download')}
            />
          )}
          <Toolbar>
            <span style={{ fontSize: 'var(--font-xs)', color: 'var(--app-muted)' }}>
              yt-dlp {tools?.ytdlp.version ?? '—'}
              {tools?.jsRuntime ? ` · JS: ${tools.jsRuntime.name}` : ''}
              {tools?.ffmpeg.available ? ' · ffmpeg ok' : ''}
            </span>
            <Spacer />
            <Button onClick={() => void updateYtdlp()} disabled={updateState.running} icon={<RefreshCw size={12} className={updateState.running ? 'spin' : undefined} />}>
              {updateState.running ? 'Atualizando…' : 'Atualizar yt-dlp'}
            </Button>
          </Toolbar>
          {updateState.message && (
            <Banner tone={updateState.tone} onClose={() => setUpdateState({ running: false })}>
              {updateState.message}
            </Banner>
          )}
        </div>
      )}

      {ytdlpMissing && <Banner tone="danger">yt-dlp não está instalado no agente. Rode “pip install -r requirements.txt” na pasta agent.</Banner>}
      {tools && !tools.ffmpeg.available && (
        <InstallHint command={tools.hints.ffmpeg}>Sem ffmpeg: não dá para juntar vídeo + áudio, extrair áudio nem baixar trechos.</InstallHint>
      )}
      {tools && !tools.jsRuntime && (
        <InstallHint tone="accent" command={tools.hints.jsRuntime}>
          Para todos os formatos do YouTube, instale um runtime JavaScript (Deno ou Node.js):
        </InstallHint>
      )}
      {error && <Banner onClose={() => setError(null)}>{error}</Banner>}
      {jobsApi.error && <Banner onClose={() => jobsApi.setError(null)}>{jobsApi.error}</Banner>}

      {/* Pré-visualização */}
      {urlIsValid && (isPreviewing || preview || previewError) && (
        <div
          data-testid="download-preview"
          style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'var(--app-surface-muted)', border: '1px solid var(--app-border)', borderRadius: 'var(--radius-lg)', padding: '6px', flexShrink: 0 }}
        >
          {isPreviewing && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--app-muted)' }}>
              <Loader2 size={13} className="spin" /> Buscando informações do link…
            </span>
          )}
          {previewError && <span style={{ color: 'var(--app-danger)', fontSize: 'var(--font-sm)' }}>{previewError}</span>}
          {preview && (
            <>
              {preview.thumbnail && !isCompact && (
                <img
                  src={preview.thumbnail}
                  alt=""
                  referrerPolicy="no-referrer"
                  style={{ width: '96px', height: '54px', objectFit: 'cover', borderRadius: 'var(--radius-md)', flexShrink: 0, background: 'var(--app-border)' }}
                />
              )}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div title={preview.title} style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {preview.title}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: 'var(--font-xs)', color: 'var(--app-muted)', marginTop: '2px', minWidth: 0 }}>
                  {preview.kind === 'playlist' && (
                    <Badge tone="accent">
                      <ListVideo size={9} style={{ verticalAlign: '-1px' }} /> {preview.count} vídeos
                    </Badge>
                  )}
                  {preview.isLive && <Badge tone="danger">AO VIVO</Badge>}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[preview.uploader, formatDuration(preview.duration), maxHeight ? `até ${maxHeight}p` : ''].filter(Boolean).join(' · ')}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Modo simples */}
      <SegmentedControl ariaLabel="O que baixar" stretch compact={isCompact} value={options.mode} onChange={(mode) => update({ mode })} options={MODES} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '6px', flexShrink: 0 }}>
        {isAudio ? (
          <>
            <div>
              <FieldLabel htmlFor={fieldId('audio-format')}>Formato</FieldLabel>
              <Select id={fieldId('audio-format')} value={options.audioFormat} onChange={(event) => update({ audioFormat: event.target.value as DownloadOptions['audioFormat'] })} style={{ width: '100%' }}>
                {(['mp3', 'm4a', 'opus', 'wav', 'flac'] as const).map((format) => (
                  <option key={format} value={format}>
                    {format.toUpperCase()}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <FieldLabel htmlFor={fieldId('audio-quality')}>Qualidade</FieldLabel>
              <Select
                id={fieldId('audio-quality')}
                value={options.audioQuality}
                disabled={options.audioFormat === 'wav' || options.audioFormat === 'flac'}
                onChange={(event) => update({ audioQuality: event.target.value as DownloadOptions['audioQuality'] })}
                style={{ width: '100%' }}
              >
                <option value="best">Melhor</option>
                <option value="320">320 kbps</option>
                <option value="192">192 kbps</option>
                <option value="128">128 kbps</option>
              </Select>
            </div>
          </>
        ) : (
          <>
            <div>
              <FieldLabel htmlFor={fieldId('video-format')}>Formato</FieldLabel>
              <Select id={fieldId('video-format')} value={options.videoFormat} onChange={(event) => update({ videoFormat: event.target.value as DownloadOptions['videoFormat'] })} style={{ width: '100%' }}>
                <option value="mp4">MP4</option>
                <option value="mkv">MKV</option>
                <option value="webm">WebM</option>
              </Select>
            </div>
            <div>
              <FieldLabel htmlFor={fieldId('quality')}>Qualidade</FieldLabel>
              <Select id={fieldId('quality')} value={options.quality} onChange={(event) => update({ quality: event.target.value as DownloadOptions['quality'] })} style={{ width: '100%' }}>
                <option value="best">Melhor disponível</option>
                {qualities.map((quality) => (
                  <option key={quality} value={quality}>
                    Até {quality}p
                  </option>
                ))}
              </Select>
            </div>
          </>
        )}
      </div>

      {/* Modo avançado */}
      <button
        type="button"
        onClick={() => setShowAdvanced((value) => !value)}
        aria-expanded={showAdvanced}
        style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: 'var(--app-muted)', cursor: 'pointer', padding: 0, fontSize: 'var(--font-sm)', fontWeight: 600, flexShrink: 0, alignSelf: 'flex-start' }}
      >
        {showAdvanced ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Opções avançadas
      </button>
      {showAdvanced && (
        <div
          data-testid="advanced-options"
          style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: 'var(--app-surface-muted)', border: '1px solid var(--app-border)', borderRadius: 'var(--radius-lg)', padding: '8px', flexShrink: 0 }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '4px 8px' }}>
            <CheckboxField label="Baixar a playlist inteira" checked={options.playlist} onChange={(playlist) => update({ playlist })} hint="Quando o link faz parte de uma playlist, baixa todos os vídeos dela" />
            <CheckboxField label="Gravar metadados" checked={options.embedMetadata} onChange={(embedMetadata) => update({ embedMetadata })} hint="Título, canal e data dentro do arquivo" />
            <CheckboxField label="Incorporar miniatura" checked={options.embedThumbnail} onChange={(embedThumbnail) => update({ embedThumbnail })} hint="Capa do vídeo dentro do arquivo" />
            <CheckboxField label="Marcar capítulos" checked={options.embedChapters} disabled={isAudio} onChange={(embedChapters) => update({ embedChapters })} />
            <CheckboxField label="Legendas" checked={options.subtitles} disabled={isAudio} onChange={(subtitles) => update({ subtitles })} hint="Legendas enviadas pelo autor, dentro do vídeo" />
            <CheckboxField label="Legendas automáticas" checked={options.autoSubtitles} disabled={isAudio} onChange={(autoSubtitles) => update({ autoSubtitles })} hint="Legendas geradas automaticamente pelo site" />
            <CheckboxField label="Pular patrocínios" checked={options.sponsorBlock} onChange={(sponsorBlock) => update({ sponsorBlock })} hint="Remove trechos patrocinados marcados no SponsorBlock (YouTube)" />
            <CheckboxField label="Nomes sem acentos/espaços" checked={options.restrictFilenames} onChange={(restrictFilenames) => update({ restrictFilenames })} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '6px' }}>
            <div>
              <FieldLabel htmlFor={fieldId('sub-langs')}>Idioma das legendas</FieldLabel>
              <Select id={fieldId('sub-langs')} value={options.subLangs} disabled={isAudio || (!options.subtitles && !options.autoSubtitles)} onChange={(event) => update({ subLangs: event.target.value as DownloadOptions['subLangs'] })} style={{ width: '100%' }}>
                <option value="pt,en">Português e inglês</option>
                <option value="pt">Português</option>
                <option value="en">Inglês</option>
                <option value="all">Todos</option>
              </Select>
            </div>
            <div>
              <FieldLabel htmlFor={fieldId('rate')}>Limite de velocidade</FieldLabel>
              <Select id={fieldId('rate')} value={options.rateLimit} onChange={(event) => update({ rateLimit: event.target.value as DownloadOptions['rateLimit'] })} style={{ width: '100%' }}>
                <option value="">Sem limite</option>
                <option value="500K">500 KB/s</option>
                <option value="1M">1 MB/s</option>
                <option value="2M">2 MB/s</option>
                <option value="5M">5 MB/s</option>
                <option value="10M">10 MB/s</option>
              </Select>
            </div>
            <div>
              <FieldLabel htmlFor={fieldId('template')}>Nome do arquivo</FieldLabel>
              <Select id={fieldId('template')} value={options.filenameTemplate} onChange={(event) => update({ filenameTemplate: event.target.value as DownloadOptions['filenameTemplate'] })} style={{ width: '100%' }}>
                <option value="title">Título</option>
                <option value="uploader-title">Canal - Título</option>
                <option value="date-title">Data - Título</option>
                <option value="index-title">Nº na playlist - Título</option>
              </Select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            <div>
              <FieldLabel htmlFor={fieldId('start')}>Trecho: início</FieldLabel>
              <Input id={fieldId('start')} value={options.sectionStart} placeholder="00:00" onChange={(event) => update({ sectionStart: event.target.value })} style={{ width: '100%', fontSize: 'var(--font-sm)' }} />
            </div>
            <div>
              <FieldLabel htmlFor={fieldId('end')}>Trecho: fim</FieldLabel>
              <Input id={fieldId('end')} value={options.sectionEnd} placeholder="até o fim" onChange={(event) => update({ sectionEnd: event.target.value })} style={{ width: '100%', fontSize: 'var(--font-sm)' }} />
            </div>
          </div>
          {sectionInvalid && <span style={{ color: 'var(--app-danger)', fontSize: 'var(--font-xs)' }}>Use HH:MM:SS, MM:SS ou segundos no trecho.</span>}
        </div>
      )}

      <Button variant="primary" size="md" block icon={<Download size={14} />} disabled={!canDownload} onClick={() => void startDownload()}>
        {isSubmitting ? 'Adicionando…' : preview?.kind === 'playlist' && options.playlist ? `Baixar ${preview.count ?? ''} vídeos` : 'Baixar'}
      </Button>

      <div style={{ flex: 1, minHeight: '60px', overflowY: 'auto' }}>
        <MediaJobList
          jobs={jobsApi.jobs}
          emptyText="Os downloads aparecem aqui, com progresso e atalhos para abrir."
          onCancel={(id) => void jobsApi.cancel(id)}
          onRemove={(id) => void jobsApi.remove(id)}
          onOpen={(id, action) => void jobsApi.open(id, action)}
          onClearFinished={() => void jobsApi.clearFinished()}
          renderDoneActions={(job) => (
            <SendToButton actions={context.actions} kinds={['file']} iconOnly label="Enviar arquivo para…" build={(target) => outputMessages(job, target)} style={{ padding: '2px' }} />
          )}
        />
      </div>
    </div>
  );
};

export const mediaDownloaderWidget: WidgetDefinition = {
  manifest: {
    id: 'media-downloader',
    name: 'Downloader de Vídeos',
    version: '1.1.0',
    description: 'Baixa vídeos e áudios (YouTube e outros) com o yt-dlp: formato, qualidade, fila e opções avançadas.',
    icon: 'Download',
    author: 'Dashboard Core',
    status: 'stable',
    defaultSize: { w: 4, h: 6 },
    minSize: { w: 3, h: 4 },
    maxSize: { w: 8, h: 12 },
    requiresAgent: true,
    accepts: ['url'],
  },
  component: MediaDownloaderWidget,
};
