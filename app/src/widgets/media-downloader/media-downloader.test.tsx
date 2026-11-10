import { describe, expect, it } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { isValidUrl, mediaDownloaderWidget } from './index';
import { MemoryStorage, renderWidget } from '../../test/harness';
import { mediaAgent, mediaJob } from '../../test/mediaAgent';

const LINK = 'https://www.youtube.com/watch?v=abc123';
const linkInput = () => screen.getByLabelText('Link do vídeo');
const downloadButton = () => screen.getByRole('button', { name: /^Baixar/ });
const previewRequests = (agent: ReturnType<typeof mediaAgent>['agent']) => agent.requests.filter((request) => request.path === '/media/download/preview');
const lastDownload = (agent: ReturnType<typeof mediaAgent>['agent']) => [...agent.requests].reverse().find((request) => request.path === '/media/download')!.body;

async function ready() {
  return screen.findByText('Os downloads aparecem aqui, com progresso e atalhos para abrir.');
}

describe('Downloader de Vídeos', () => {
  it('valida links', () => {
    expect(isValidUrl(LINK)).toBe(true);
    expect(isValidUrl('youtube.com/watch')).toBe(false);
    expect(isValidUrl('file:///c:/x')).toBe(false);
    expect(isValidUrl('javascript:alert(1)')).toBe(false);
  });

  it('sem agente mostra aviso', () => {
    renderWidget(mediaDownloaderWidget);
    expect(screen.getByText(/Inicie o serviço local para baixar vídeos e áudios/)).toBeInTheDocument();
  });

  it('pré-visualiza o link e limita as qualidades ao que o vídeo tem', async () => {
    const user = userEvent.setup();
    const { agent } = mediaAgent();
    renderWidget(mediaDownloaderWidget, { agent });
    await ready();
    expect(downloadButton()).toBeDisabled();

    await user.type(linkInput(), 'não é link');
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(previewRequests(agent)).toHaveLength(0);

    await user.clear(linkInput());
    await user.click(linkInput());
    await user.paste(LINK);
    const preview = await screen.findByTestId('download-preview');
    expect(within(preview).getByText(/Buscando informações/)).toBeInTheDocument();
    expect(await within(preview).findByText('Aula de Python', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(within(preview).getByText('Canal Dev · 3:05 · até 1080p')).toBeInTheDocument();
    expect(previewRequests(agent)).toHaveLength(1);
    expect(previewRequests(agent)[0].body).toEqual({ url: LINK, playlist: false });

    const qualities = within(screen.getByLabelText('Qualidade')).getAllByRole('option').map((option) => option.textContent);
    expect(qualities).toEqual(['Melhor disponível', 'Até 1080p', 'Até 720p', 'Até 480p', 'Até 360p', 'Até 240p']);
    expect(downloadButton()).toBeEnabled();
  });

  it('baixa só o áudio com o formato escolhido e entra na fila', async () => {
    const user = userEvent.setup();
    const { agent } = mediaAgent();
    renderWidget(mediaDownloaderWidget, { agent });
    await ready();
    await user.click(linkInput());
    await user.paste(LINK);
    await screen.findByText('Aula de Python', {}, { timeout: 3000 });

    await user.click(screen.getByRole('button', { name: 'Só áudio' }));
    await user.selectOptions(screen.getByLabelText('Formato'), 'm4a');
    await user.selectOptions(screen.getByLabelText('Qualidade'), '192');
    await user.click(downloadButton());

    const body = lastDownload(agent);
    expect(body.url).toBe(LINK);
    expect(body.title).toBe('Aula de Python');
    expect(body.options).toMatchObject({ mode: 'audio', audioFormat: 'm4a', audioQuality: '192', playlist: false });
    expect(await screen.findByTestId('media-job')).toHaveTextContent('Aula de Python');
    expect(linkInput()).toHaveValue('');
  });

  it('Enter no campo também inicia o download', async () => {
    const user = userEvent.setup();
    const { agent, state } = mediaAgent();
    renderWidget(mediaDownloaderWidget, { agent });
    await ready();
    await user.click(linkInput());
    await user.paste(LINK);
    await user.keyboard('{Enter}');
    await waitFor(() => expect(state.jobs).toHaveLength(1));
  });

  it('opções avançadas: playlist, legendas, trecho validado e preferências lembradas', async () => {
    const user = userEvent.setup();
    const storage = new MemoryStorage();
    const { agent, state } = mediaAgent();
    state.preview = { kind: 'playlist', title: 'Curso completo', uploader: 'Canal Dev', count: 12, duration: null, thumbnail: null, entries: [] };
    const view = renderWidget(mediaDownloaderWidget, { agent, storage });
    await ready();
    expect(screen.queryByTestId('advanced-options')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Opções avançadas' }));
    const advanced = screen.getByTestId('advanced-options');

    await user.click(linkInput());
    await user.paste(LINK);
    await screen.findByText('Curso completo', {}, { timeout: 3000 });
    await user.click(within(advanced).getByLabelText('Baixar a playlist inteira'));
    // Mudar "playlist" consulta o link de novo, agora como playlist.
    await waitFor(() => expect(previewRequests(agent).slice(-1)[0].body).toEqual({ url: LINK, playlist: true }), { timeout: 3000 });
    expect(await screen.findByRole('button', { name: 'Baixar 12 vídeos' }, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText('12 vídeos')).toBeInTheDocument();

    expect(within(advanced).getByLabelText('Idioma das legendas')).toBeDisabled();
    await user.click(within(advanced).getByLabelText('Legendas'));
    await user.selectOptions(within(advanced).getByLabelText('Idioma das legendas'), 'pt');
    await user.selectOptions(within(advanced).getByLabelText('Limite de velocidade'), '2M');

    await user.type(within(advanced).getByLabelText('Trecho: início'), 'abc');
    expect(screen.getByText(/Use HH:MM:SS/)).toBeInTheDocument();
    expect(downloadButton()).toBeDisabled();
    await user.clear(within(advanced).getByLabelText('Trecho: início'));
    await user.type(within(advanced).getByLabelText('Trecho: início'), '1:30');
    await user.click(downloadButton());

    expect(lastDownload(agent).options).toMatchObject({ playlist: true, subtitles: true, subLangs: 'pt', rateLimit: '2M', sectionStart: '1:30', sectionEnd: '' });
    // O trecho é só para este link.
    await waitFor(() => expect(within(advanced).getByLabelText('Trecho: início')).toHaveValue(''));

    view.reload();
    await ready();
    const restored = screen.getByTestId('advanced-options');
    expect(within(restored).getByLabelText('Legendas')).toBeChecked();
    expect(within(restored).getByLabelText('Limite de velocidade')).toHaveValue('2M');
    expect(await storage.get('options')).not.toHaveProperty('sectionStart');
  });

  it('legendas e capítulos não se aplicam a áudio', async () => {
    const user = userEvent.setup();
    const { agent } = mediaAgent();
    renderWidget(mediaDownloaderWidget, { agent });
    await ready();
    await user.click(screen.getByRole('button', { name: 'Só áudio' }));
    await user.click(screen.getByRole('button', { name: 'Opções avançadas' }));
    expect(screen.getByLabelText('Legendas')).toBeDisabled();
    expect(screen.getByLabelText('Marcar capítulos')).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('Formato'), 'flac');
    expect(screen.getByLabelText('Qualidade')).toBeDisabled(); // sem perdas: qualidade não se aplica
  });

  it('erro na pré-visualização aparece, mas não impede tentar', async () => {
    const user = userEvent.setup();
    const { agent } = mediaAgent();
    renderWidget(mediaDownloaderWidget, { agent });
    await ready();
    await user.click(linkInput());
    await user.paste('https://site.example/quebrado');
    expect(await screen.findByText('Este link não é suportado pelo yt-dlp.', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(downloadButton()).toBeEnabled();
  });

  it('progresso de download com velocidade, tempo restante e item da playlist', async () => {
    const job = mediaJob({ kind: 'download', title: 'Curso completo', summary: 'Vídeo MP4 · até 720p' });
    const { agent } = mediaAgent({ jobs: [job] });
    renderWidget(mediaDownloaderWidget, { agent });
    const row = await screen.findByTestId('media-job');
    act(() => agent.emit('media:job', { ...job, status: 'running', stage: 'Baixando', progress: 40, speed: 1572864, eta: 30, item: '2/5' }));
    expect(within(row).getByText('Baixando (2/5) · 40% · 1,5 MB/s · 0:30 restantes')).toBeInTheDocument();
    act(() => agent.emit('media:job', { ...job, status: 'processing', stage: 'Processando' }));
    expect(within(row).getByText('Processando…')).toBeInTheDocument();
    act(() => agent.emit('media:job', { ...job, status: 'error', error: 'Vídeo privado.' }));
    expect(within(row).getByText('Vídeo privado.')).toBeInTheDocument();
  });

  it('avisa quando faltam ffmpeg, runtime JavaScript ou o yt-dlp', async () => {
    const { agent } = mediaAgent({
      tools: { ffmpeg: { available: false, path: null, version: null }, jsRuntime: null, ytdlp: { available: false, version: null } },
    });
    renderWidget(mediaDownloaderWidget, { agent });
    expect(await screen.findByText('winget install Gyan.FFmpeg')).toBeInTheDocument();
    expect(screen.getByText('winget install DenoLand.Deno')).toBeInTheDocument();
    expect(screen.getByText(/yt-dlp não está instalado/)).toBeInTheDocument();
    await userEvent.setup().type(linkInput(), LINK);
    expect(downloadButton()).toBeDisabled();
  });

  it('configurações: pasta de destino e atualizar o yt-dlp', async () => {
    const user = userEvent.setup();
    const { agent, state } = mediaAgent();
    renderWidget(mediaDownloaderWidget, { agent });
    await ready();
    await user.click(screen.getByRole('button', { name: 'Configurações do downloader' }));
    expect(await screen.findByText(/yt-dlp 2026.10.26 · JS: node · ffmpeg ok/)).toBeInTheDocument();

    const folder = screen.getByLabelText('Pasta de destino');
    await user.clear(folder);
    await user.type(folder, 'relativa');
    await user.click(screen.getByRole('button', { name: 'Salvar pasta' }));
    expect(await screen.findByText('Informe o caminho completo da pasta.')).toBeInTheDocument();
    await user.clear(folder);
    await user.type(folder, 'E:\\Videos');
    await user.click(screen.getByRole('button', { name: 'Salvar pasta' }));
    await waitFor(() => expect(state.settings.downloadDir).toBe('E:\\Videos'));

    await user.click(screen.getByRole('button', { name: 'Atualizar yt-dlp' }));
    expect(await screen.findByText('yt-dlp atualizado: 2026.10.26 → 2026.11.01.')).toBeInTheDocument();
  });
});
