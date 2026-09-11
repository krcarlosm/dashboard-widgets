import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FileCog, UploadCloud, Copy, Download, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { WidgetDefinition, WidgetComponentProps } from '../../sdk/types';

// ============================================================================
// 1. Tipos e constantes do domínio
// ============================================================================

interface FileConverterConfig {
  /** Modo padrão pré-selecionado ao abrir o widget */
  defaultMode?: 'convert' | 'compress' | 'both';
  /** Nível de compressão padrão */
  defaultCompressionLevel?: 'none' | 'low' | 'medium' | 'high';
}

type FileCategory = 'image' | 'video' | 'audio' | 'other';
type ConversionMode = 'convert' | 'compress' | 'both';
type CompressionLevel = 'none' | 'low' | 'medium' | 'high';
type WidgetStatus = 'idle' | 'reading' | 'ready' | 'converting' | 'done' | 'error';

interface FileMetadata {
  name: string;
  sizeLabel: string;
  sizeBytes: number;
  type: string;
  lastModified: string;
  extra: Record<string, string>;
}

interface ConversionResult {
  fileName: string;
  sizeLabel?: string;
  outputPath?: string; // preenchido quando o Agent salva em disco
  viaAgent: boolean;
}

const IMAGE_FORMATS = ['png', 'jpeg', 'webp', 'bmp'];
const VIDEO_FORMATS = ['mp4', 'avi', 'mov', 'mkv', 'webm', '3gp', 'mpeg'];
const AUDIO_FORMATS = ['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a'];

const AGENT_SIZE_LIMIT_BYTES = 50 * 1024 * 1024; // 50MB sem acesso a file.path

// ============================================================================
// 2. Helpers puros (sem dependência de React)
// ============================================================================

function getCategory(file: File): FileCategory {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (IMAGE_FORMATS.includes(ext)) return 'image';
  if (VIDEO_FORMATS.includes(ext)) return 'video';
  if (AUDIO_FORMATS.includes(ext)) return 'audio';
  return 'other';
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function baseName(fileName: string): string {
  const idx = fileName.lastIndexOf('.');
  return idx === -1 ? fileName : fileName.slice(0, idx);
}

function makeRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/** Lê dimensões/duração via elementos temporários de mídia (sem custar re-render). */
function readMediaMetadata(file: File, category: FileCategory): Promise<Record<string, string>> {
  return new Promise((resolve) => {
    if (category !== 'image' && category !== 'video' && category !== 'audio') {
      resolve({});
      return;
    }
    const url = URL.createObjectURL(file);
    const cleanup = () => URL.revokeObjectURL(url);

    if (category === 'image') {
      const img = new Image();
      img.onload = () => {
        resolve({ Dimensões: `${img.naturalWidth} × ${img.naturalHeight}px` });
        cleanup();
      };
      img.onerror = () => {
        resolve({});
        cleanup();
      };
      img.src = url;
      return;
    }

    const el = document.createElement(category === 'video' ? 'video' : 'audio');
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      const info: Record<string, string> = {
        Duração: `${el.duration.toFixed(1)}s`,
      };
      if (category === 'video' && el instanceof HTMLVideoElement) {
        info['Resolução'] = `${el.videoWidth} × ${el.videoHeight}px`;
      }
      resolve(info);
      cleanup();
    };
    el.onerror = () => {
      resolve({});
      cleanup();
    };
    el.src = url;
  });
}

async function extractMetadata(file: File, category: FileCategory): Promise<FileMetadata> {
  const extra = await readMediaMetadata(file, category);
  return {
    name: file.name,
    sizeLabel: formatBytes(file.size),
    sizeBytes: file.size,
    type: file.type || 'desconhecido',
    lastModified: new Date(file.lastModified).toLocaleString('pt-BR'),
    extra,
  };
}

function formatsForCategory(category: FileCategory): string[] {
  if (category === 'image') return IMAGE_FORMATS;
  if (category === 'video') return VIDEO_FORMATS;
  if (category === 'audio') return AUDIO_FORMATS;
  return [];
}

function qualityForLevel(level: CompressionLevel): number {
  switch (level) {
    case 'low': return 0.85;
    case 'medium': return 0.7;
    case 'high': return 0.5;
    default: return 0.92;
  }
}

/** Conversão/compressão de imagem 100% client-side via Canvas. Não depende do Agent. */
async function convertImageClientSide(
  file: File,
  targetFormat: string,
  level: CompressionLevel,
): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D não suportado neste navegador.');
    ctx.drawImage(img, 0, 0);

    const mime = `image/${targetFormat === 'jpg' ? 'jpeg' : targetFormat}`;
    const quality = targetFormat === 'png' ? undefined : qualityForLevel(level);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Falha ao gerar arquivo convertido.'))),
        mime,
        quality,
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function triggerBrowserDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Lê um File como base64 (usado só quando não há acesso a file.path e o arquivo é pequeno). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ============================================================================
// 3. Componente
// ============================================================================

const FileConverterComponent: React.FC<WidgetComponentProps<FileConverterConfig>> = ({ context }) => {
  const { config, agentClient, dimensions } = context;

  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<FileCategory>('other');
  const [metadata, setMetadata] = useState<FileMetadata | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const [mode, setMode] = useState<ConversionMode>(config.defaultMode ?? 'convert');
  const [targetFormat, setTargetFormat] = useState<string>('');
  const [compressionLevel, setCompressionLevel] = useState<CompressionLevel>(
    config.defaultCompressionLevel ?? 'medium',
  );
  const [resolution, setResolution] = useState<string>('original');

  const [status, setStatus] = useState<WidgetStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [copied, setCopied] = useState(false);

  const requestIdRef = useRef<string | null>(null);
  const compact = dimensions.width < 340;

  // --- Inscrição nos eventos do Agent (por instância, via useEffect) -------
  useEffect(() => {
    const unsubProgress = agentClient.subscribe('file-converter:progress', (payload) => {
      if (payload?.requestId !== requestIdRef.current) return;
      setProgress(payload.percent ?? 0);
    });
    const unsubDone = agentClient.subscribe('file-converter:done', (payload) => {
      if (payload?.requestId !== requestIdRef.current) return;
      setStatus('done');
      setProgress(100);
      setResult({
        fileName: payload.fileName,
        sizeLabel: payload.sizeBytes ? formatBytes(payload.sizeBytes) : undefined,
        outputPath: payload.outputPath,
        viaAgent: true,
      });
    });
    const unsubError = agentClient.subscribe('file-converter:error', (payload) => {
      if (payload?.requestId !== requestIdRef.current) return;
      setStatus('error');
      setErrorMsg(payload.message ?? 'O Agent retornou um erro desconhecido.');
    });

    return () => {
      unsubProgress();
      unsubDone();
      unsubError();
    };
  }, [agentClient]);

  // --- Seleção de arquivo ---------------------------------------------------
  const handleFile = useCallback(async (f: File) => {
    setStatus('reading');
    setErrorMsg(null);
    setResult(null);
    setCopied(false);
    setProgress(0);

    const cat = getCategory(f);
    setFile(f);
    setCategory(cat);

    const formats = formatsForCategory(cat);
    setTargetFormat(formats[0] ?? '');
    setResolution('original');

    const meta = await extractMetadata(f, cat);
    setMetadata(meta);
    setStatus(cat === 'other' ? 'error' : 'ready');
    if (cat === 'other') {
      setErrorMsg('Formato não reconhecido para conversão. Você ainda pode consultar os metadados básicos acima.');
    }
  }, []);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const reset = () => {
    setFile(null);
    setMetadata(null);
    setStatus('idle');
    setErrorMsg(null);
    setResult(null);
    setProgress(0);
  };

  // --- Copiar metadados ------------------------------------------------------
  const copyMetadata = async () => {
    if (!metadata) return;
    const text = [
      `Nome: ${metadata.name}`,
      `Tamanho: ${metadata.sizeLabel}`,
      `Tipo: ${metadata.type}`,
      `Modificado em: ${metadata.lastModified}`,
      ...Object.entries(metadata.extra).map(([k, v]) => `${k}: ${v}`),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setErrorMsg('Não foi possível acessar a área de transferência.');
    }
  };

  // --- Conversão ---------------------------------------------------------
  const runConversion = async () => {
    if (!file || !targetFormat) return;
    setErrorMsg(null);
    setStatus('converting');
    setProgress(0);

    try {
      if (category === 'image') {
        // 100% client-side, não depende do Agent.
        const outFormat = mode === 'compress' ? (file.name.split('.').pop() ?? targetFormat) : targetFormat;
        const blob = await convertImageClientSide(file, outFormat, compressionLevel);
        const outName = `${baseName(file.name)}_convertido.${outFormat === 'jpeg' ? 'jpg' : outFormat}`;
        triggerBrowserDownload(blob, outName);
        setResult({ fileName: outName, sizeLabel: formatBytes(blob.size), viaAgent: false });
        setStatus('done');
        setProgress(100);
        return;
      }

      // Vídeo/Áudio: delega ao Python Local Agent.
      if (!agentClient.isConnected) {
        throw new Error('Agent desconectado. Conversão de vídeo/áudio requer o Agent Python rodando localmente.');
      }

      const requestId = makeRequestId();
      requestIdRef.current = requestId;

      const path = (file as unknown as { path?: string }).path;
      const payload: Record<string, unknown> = {
        requestId,
        fileName: file.name,
        category,
        mode,
        targetFormat: mode === 'compress' ? (file.name.split('.').pop() ?? '') : targetFormat,
        compressionLevel,
        resolution: category === 'video' ? resolution : undefined,
      };

      if (path) {
        payload.sourcePath = path;
      } else if (file.size <= AGENT_SIZE_LIMIT_BYTES) {
        payload.sourceBase64 = await fileToBase64(file);
      } else {
        throw new Error(
          `Arquivo muito grande (${formatBytes(file.size)}) para enviar sem acesso direto ao disco. ` +
          `Use o app em modo desktop ou reduza o arquivo para até ${formatBytes(AGENT_SIZE_LIMIT_BYTES)}.`,
        );
      }

      agentClient.send({ type: 'file-converter:convert', payload });
      // O restante do fluxo (progress/done/error) chega pelos listeners do useEffect acima.
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Erro desconhecido ao converter o arquivo.');
    }
  };

  const canUseAgentFeature = category === 'image' || agentClient.isConnected;
  const formats = formatsForCategory(category);

  // ==========================================================================
  // Render
  // ==========================================================================
  return (
    <div className="h-full w-full overflow-auto flex flex-col gap-3 p-3 bg-[var(--app-surface)] text-[var(--app-text)]">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <FileCog size={16} className="text-[var(--app-accent)]" />
          {compact ? 'Conversor' : 'Conversor de Arquivos'}
        </h3>
        {file && (
          <button
            onClick={reset}
            className="text-[var(--app-muted)] hover:text-[var(--app-text)]"
            title="Remover arquivo"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {!file && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={onDrop}
          className={`flex-1 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
            dragActive ? 'border-[var(--app-accent)]' : 'border-[var(--app-border)]'
          }`}
        >
          <UploadCloud size={28} className="text-[var(--app-muted)]" />
          <p className="text-sm text-[var(--app-muted)]">
            Arraste um arquivo aqui ou
          </p>
          <label className="cursor-pointer text-sm px-3 py-1.5 rounded bg-[var(--app-accent)] text-white hover:opacity-90">
            Selecionar arquivo
            <input type="file" className="hidden" onChange={onInputChange} />
          </label>
        </div>
      )}

      {file && metadata && (
        <div className="flex flex-col gap-3">
          {/* Metadados */}
          <div className="rounded-lg border border-[var(--app-border)] p-2.5 text-sm">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-medium truncate pr-2">{metadata.name}</span>
              <button
                onClick={copyMetadata}
                className="shrink-0 flex items-center gap-1 text-xs text-[var(--app-muted)] hover:text-[var(--app-accent)]"
                title="Copiar metadados"
              >
                <Copy size={13} /> {copied ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
            <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs text-[var(--app-muted)]">
              <dt>Tamanho</dt><dd className="text-[var(--app-text)]">{metadata.sizeLabel}</dd>
              <dt>Tipo</dt><dd className="text-[var(--app-text)]">{metadata.type}</dd>
              {Object.entries(metadata.extra).map(([k, v]) => (
                <React.Fragment key={k}>
                  <dt>{k}</dt><dd className="text-[var(--app-text)]">{v}</dd>
                </React.Fragment>
              ))}
            </dl>
          </div>

          {category !== 'other' && (
            <>
              {/* Modo */}
              <div className="flex gap-1.5 text-xs">
                {(['convert', 'compress', 'both'] as ConversionMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`flex-1 py-1.5 rounded border ${
                      mode === m
                        ? 'border-[var(--app-accent)] bg-[var(--app-accent)]/10 text-[var(--app-accent)]'
                        : 'border-[var(--app-border)] text-[var(--app-muted)]'
                    }`}
                  >
                    {m === 'convert' ? 'Converter' : m === 'compress' ? 'Compactar' : 'Ambos'}
                  </button>
                ))}
              </div>

              {/* Formato de destino */}
              {mode !== 'compress' && (
                <label className="text-xs text-[var(--app-muted)] flex flex-col gap-1">
                  Formato de destino
                  <select
                    value={targetFormat}
                    onChange={(e) => setTargetFormat(e.target.value)}
                    className="bg-[var(--app-surface)] border border-[var(--app-border)] rounded px-2 py-1.5 text-[var(--app-text)]"
                  >
                    {formats.map((f) => (
                      <option key={f} value={f}>{f.toUpperCase()}</option>
                    ))}
                  </select>
                </label>
              )}

              {/* Nível de compressão */}
              {mode !== 'convert' && (
                <label className="text-xs text-[var(--app-muted)] flex flex-col gap-1">
                  Nível de compactação
                  <select
                    value={compressionLevel}
                    onChange={(e) => setCompressionLevel(e.target.value as CompressionLevel)}
                    className="bg-[var(--app-surface)] border border-[var(--app-border)] rounded px-2 py-1.5 text-[var(--app-text)]"
                  >
                    <option value="low">Leve (melhor qualidade)</option>
                    <option value="medium">Média</option>
                    <option value="high">Alta (menor tamanho)</option>
                  </select>
                </label>
              )}

              {/* Resolução (só vídeo) */}
              {category === 'video' && mode !== 'convert' && (
                <label className="text-xs text-[var(--app-muted)] flex flex-col gap-1">
                  Resolução de saída
                  <select
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    className="bg-[var(--app-surface)] border border-[var(--app-border)] rounded px-2 py-1.5 text-[var(--app-text)]"
                  >
                    <option value="original">Original</option>
                    <option value="1080p">1080p</option>
                    <option value="720p">720p</option>
                    <option value="480p">480p</option>
                  </select>
                </label>
              )}

              {!canUseAgentFeature && (
                <div className="flex items-center gap-1.5 text-xs text-amber-500">
                  <AlertTriangle size={13} />
                  Agent desconectado — conversão de vídeo/áudio indisponível no momento.
                </div>
              )}

              <button
                onClick={runConversion}
                disabled={status === 'converting' || !canUseAgentFeature}
                className="flex items-center justify-center gap-1.5 py-2 rounded bg-[var(--app-accent)] text-white text-sm hover:opacity-90 disabled:opacity-50"
              >
                <Download size={14} />
                {status === 'converting' ? 'Processando…' : 'Converter e baixar'}
              </button>

              {status === 'converting' && (
                <div className="w-full h-1.5 rounded bg-[var(--app-border)] overflow-hidden">
                  <div
                    className="h-full bg-[var(--app-accent)] transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}

              {status === 'done' && result && (
                <div className="flex items-start gap-1.5 text-xs text-emerald-500">
                  <CheckCircle2 size={13} className="mt-0.5 shrink-0" />
                  <span>
                    {result.viaAgent
                      ? `Salvo em: ${result.outputPath ?? '~/Downloads/' + result.fileName}`
                      : `Baixado como ${result.fileName} (${result.sizeLabel})`}
                  </span>
                </div>
              )}

              {status === 'error' && errorMsg && (
                <div className="flex items-start gap-1.5 text-xs text-red-500">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}
            </>
          )}

          {category === 'other' && errorMsg && (
            <div className="flex items-start gap-1.5 text-xs text-amber-500">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 4. Exportação do Widget cumprindo o contrato
// ============================================================================

export const fileConverterWidget: WidgetDefinition<FileConverterConfig> = {
  manifest: {
    id: 'file-converter',
    name: 'Conversor de Arquivos',
    version: '1.0.0',
    description: 'Converte e compacta imagens, vídeos e áudios via drag-n-drop, com metadados e download automático.',
    icon: 'FileCog',
    status: 'in_development',
    defaultSize: { w: 6, h: 6 },
    minSize: { w: 4, h: 4 },
    maxSize: { w: 12, h: 10 },
    requiresAgent: true, // imagens funcionam sem Agent; vídeo/áudio dependem dele
  },
  component: FileConverterComponent,
};
