import { FakeAgentClient } from './harness';

// Agente falso com a API /media (Conversor e Downloader) em memória.

let counter = 0;

export function mediaJob(patch: Record<string, any> = {}) {
  counter += 1;
  return {
    id: `job${counter}`,
    kind: 'convert',
    title: 'arquivo.mp4',
    summary: 'MP3',
    status: 'queued',
    progress: 0,
    stage: '',
    speed: null,
    eta: null,
    item: null,
    outputs: [],
    error: null,
    createdAt: Date.now() / 1000,
    finishedAt: null,
    ...patch,
  };
}

export const ACTIVE = ['queued', 'running', 'processing'];

export function defaultTools(patch: Record<string, any> = {}) {
  return {
    ffmpeg: { available: true, path: 'C:\\ffmpeg\\ffmpeg.exe', version: '9.0' },
    ffprobe: { available: true },
    jsRuntime: { name: 'node', path: 'C:\\node.exe' },
    ytdlp: { available: true, version: '2026.10.26' },
    hints: { ffmpeg: 'winget install Gyan.FFmpeg', jsRuntime: 'winget install DenoLand.Deno' },
    platform: 'win32',
    formats: {
      image: { inputs: ['jpg', 'jpeg', 'png', 'webp'], targets: ['png', 'jpg', 'webp', 'bmp', 'gif', 'tiff', 'ico'] },
      video: { inputs: ['mp4', 'mkv', 'mov', 'webm'], targets: ['mp4', 'mkv', 'webm', 'mov', 'avi', 'mpeg', 'mp3', 'm4a', 'aac', 'ogg', 'opus', 'wav', 'flac'] },
      audio: { inputs: ['mp3', 'wav', 'm4a'], targets: ['mp3', 'm4a', 'aac', 'ogg', 'opus', 'wav', 'flac'] },
    },
    ...patch,
  };
}

export function mediaAgent(options: { tools?: Record<string, any>; jobs?: any[] } = {}) {
  const state = {
    tools: defaultTools(options.tools),
    jobs: [...(options.jobs ?? [])] as any[],
    settings: { downloadDir: 'C:\\Users\\eu\\Downloads\\Dashboard', convertDir: 'C:\\Users\\eu\\Downloads\\Dashboard', defaultDir: 'C:\\Users\\eu\\Downloads\\Dashboard' },
    preview: {
      kind: 'video',
      url: '',
      title: 'Aula de Python',
      uploader: 'Canal Dev',
      duration: 185,
      thumbnail: 'https://img.example/thumb.jpg',
      heights: [1080, 720, 360],
      extractor: 'Youtube',
    } as Record<string, any>,
  };
  const agent = new FakeAgentClient(true);
  const query = (path: string) => new URLSearchParams(path.split('?')[1] ?? '');

  agent
    .route('GET', '/media/tools', () => state.tools)
    .route('GET', '/media/settings', () => state.settings)
    .route('PUT', '/media/settings', ({ body }) => {
      const patch = JSON.parse(body as string);
      if (patch.downloadDir === 'relativa') throw new Error('Informe o caminho completo da pasta.');
      state.settings = { ...state.settings, ...Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, value || state.settings.defaultDir])) };
      return state.settings;
    })
    .route('POST', '/media/open-directory', { directory: 'C:\\x' })
    .route('GET', '/media/jobs', ({ path }) => ({ items: state.jobs.filter((job) => job.kind === query(path).get('kind')) }))
    .route('DELETE', '/media/jobs', ({ path }) => {
      const before = state.jobs.length;
      state.jobs = state.jobs.filter((job) => job.kind !== query(path).get('kind') || ACTIVE.includes(job.status));
      return { removed: before - state.jobs.length };
    })
    .route('DELETE', /^\/media\/jobs\/[^/?]+$/, ({ path }) => {
      const id = path.split('/').pop();
      const job = state.jobs.find((item) => item.id === id);
      if (ACTIVE.includes(job.status)) {
        job.status = 'canceled';
        return { removed: false, job };
      }
      state.jobs = state.jobs.filter((item) => item.id !== id);
      return { removed: true, job };
    })
    .route('POST', /^\/media\/jobs\/[^/]+\/(open|reveal)/, { ok: true })
    .route('POST', '/media/convert', ({ path }) => {
      const params = query(path);
      const job = mediaJob({ kind: 'convert', title: params.get('fileName'), summary: (params.get('targetFormat') ?? 'mesmo formato').toUpperCase() });
      state.jobs.push(job);
      return job;
    })
    .route('POST', '/media/download/preview', ({ body }) => {
      const request = JSON.parse(body as string);
      if (request.url.includes('quebrado')) throw new Error('Este link não é suportado pelo yt-dlp.');
      return { ...state.preview, url: request.url };
    })
    .route('POST', '/media/download', ({ body }) => {
      const request = JSON.parse(body as string);
      const job = mediaJob({ kind: 'download', title: request.title ?? request.url, summary: 'Vídeo MP4' });
      state.jobs.push(job);
      return job;
    })
    .route('POST', '/media/ytdlp/update', { before: '2026.10.26', after: '2026.11.01', updated: true });

  return { agent, state };
}
