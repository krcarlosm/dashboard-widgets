import { describe, expect, it } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fileConverterWidget } from './index';
import { MemoryStorage, renderWidget } from '../../test/harness';
import { mediaAgent, mediaJob } from '../../test/mediaAgent';

const fileOf = (name: string, type = '', size = 2048) => new File([new Uint8Array(size)], name, { type });
const fileInput = () => screen.getByLabelText('Arquivo para converter') as HTMLInputElement;
const convertButton = () => screen.getByRole('button', { name: /^(Converter arquivo|Compactar arquivo|Converter e compactar)$/ });

describe('Conversor de Arquivos', () => {
  it('sem agente: só imagens, convertidas no navegador', async () => {
    const user = userEvent.setup();
    renderWidget(fileConverterWidget);
    expect(screen.getByText(/Agente offline: só imagens/)).toBeInTheDocument();

    await user.upload(fileInput(), fileOf('foto.png', 'image/png'));
    expect(screen.getByText(/Imagem · 2 KB/)).toBeInTheDocument();
    const formats = within(screen.getByLabelText('Formato de saída')).getAllByRole('option').map((option) => option.textContent);
    expect(formats).toEqual(['PNG', 'JPG', 'WEBP']);
    expect(convertButton()).toBeEnabled();

    await user.click(screen.getByLabelText('Trocar arquivo'));
    await user.upload(fileInput(), fileOf('video.mp4', 'video/mp4'));
    expect(convertButton()).toBeDisabled();
  });

  it('envia o arquivo ao agente e mostra a tarefa na fila', async () => {
    const user = userEvent.setup();
    const { agent, state } = mediaAgent();
    renderWidget(fileConverterWidget, { agent });
    expect(await screen.findByText('Os arquivos convertidos aparecem aqui.')).toBeInTheDocument();

    await user.upload(fileInput(), fileOf('reuniao.mp4', 'video/mp4'));
    expect(screen.getByLabelText('Resolução máxima')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Formato de saída'), 'mp3');
    expect(screen.getByRole('option', { name: 'MP3 (só áudio)' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Resolução máxima')).not.toBeInTheDocument(); // áudio não tem resolução

    await user.click(convertButton());
    const upload = agent.requests.find((request) => request.path.startsWith('/media/convert'))!;
    const params = new URLSearchParams(upload.path.split('?')[1]);
    expect(Object.fromEntries(params)).toEqual({ fileName: 'reuniao.mp4', mode: 'convert', level: 'medium', resolution: 'original', targetFormat: 'mp3' });
    expect(upload.body).toEqual({ file: 'reuniao.mp4', size: 2048 });

    const row = await screen.findByTestId('media-job');
    expect(within(row).getByText('reuniao.mp4')).toBeInTheDocument();
    expect(within(row).getByText('Na fila')).toBeInTheDocument();
    expect(screen.getByTestId('drop-zone')).toBeInTheDocument(); // pronto para o próximo arquivo
    expect(state.jobs).toHaveLength(1);
  });

  it('mostra o progresso do envio e permite cancelar', async () => {
    const user = userEvent.setup();
    const { agent, state } = mediaAgent();
    renderWidget(fileConverterWidget, { agent });
    await screen.findByText('Os arquivos convertidos aparecem aqui.');
    agent.holdUploads();

    await user.upload(fileInput(), fileOf('grande.mov', 'video/quicktime'));
    await user.click(convertButton());
    expect(await screen.findByText('Enviando ao agente… 50%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Envio do arquivo' })).toHaveAttribute('aria-valuenow', '50');

    await user.click(screen.getByRole('button', { name: 'Cancelar envio' }));
    await waitFor(() => expect(convertButton()).toBeEnabled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(state.jobs).toHaveLength(0);
    expect(screen.getByText('grande.mov')).toBeInTheDocument(); // o arquivo continua escolhido
  });

  it('acompanha a tarefa pelos eventos do agente e abre o resultado', async () => {
    const user = userEvent.setup();
    const job = mediaJob({ title: 'aula.mkv', summary: 'MP4 · 720p' });
    const { agent } = mediaAgent({ jobs: [job] });
    renderWidget(fileConverterWidget, { agent });
    const row = await screen.findByTestId('media-job');

    act(() => agent.emit('media:job', { ...job, status: 'running', stage: 'Convertendo', progress: 42.5, eta: 65 }));
    expect(within(row).getByText('Convertendo · 42% · 1:05 restantes')).toBeInTheDocument();
    expect(within(row).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '43');

    // Eventos de outras filas são ignorados.
    act(() => agent.emit('media:job', mediaJob({ kind: 'download', title: 'outro' })));
    expect(screen.getAllByTestId('media-job')).toHaveLength(1);

    const output = { path: 'C:\\Dl\\aula_convertido.mp4', name: 'aula_convertido.mp4', size: 1572864 };
    act(() => agent.emit('media:job', { ...job, status: 'done', progress: 100, outputs: [output] }));
    expect(within(row).getByText('aula_convertido.mp4')).toBeInTheDocument();
    expect(within(row).getByText('Concluído · 1,5 MB')).toBeInTheDocument();

    await user.click(within(row).getByRole('button', { name: 'Abrir arquivo' }));
    await user.click(within(row).getByRole('button', { name: 'Mostrar na pasta' }));
    expect(agent.requests.map((request) => request.path)).toEqual(expect.arrayContaining([`/media/jobs/${job.id}/open`, `/media/jobs/${job.id}/reveal`]));

    await user.click(within(row).getByRole('button', { name: 'Remover da lista' }));
    await waitFor(() => expect(screen.queryByTestId('media-job')).not.toBeInTheDocument());
  });

  it('cancelar uma tarefa em andamento', async () => {
    const user = userEvent.setup();
    const job = mediaJob({ status: 'running', stage: 'Convertendo', progress: null });
    const { agent } = mediaAgent({ jobs: [job] });
    renderWidget(fileConverterWidget, { agent });
    const row = await screen.findByTestId('media-job');
    expect(within(row).getByRole('progressbar')).not.toHaveAttribute('aria-valuenow'); // sem estimativa
    await user.click(within(row).getByRole('button', { name: 'Cancelar' }));
    expect(await within(row).findByText('Cancelado')).toBeInTheDocument();
  });

  it('sem ffmpeg: mostra o comando de instalação e bloqueia vídeo, mas não imagem', async () => {
    const user = userEvent.setup();
    const { agent } = mediaAgent({ tools: { ffmpeg: { available: false, path: null, version: null } } });
    renderWidget(fileConverterWidget, { agent });
    await screen.findByText('Os arquivos convertidos aparecem aqui.');

    await user.upload(fileInput(), fileOf('som.wav', 'audio/wav'));
    expect(await screen.findByText('winget install Gyan.FFmpeg')).toBeInTheDocument();
    expect(convertButton()).toBeDisabled();

    await user.click(screen.getByLabelText('Trocar arquivo'));
    await user.upload(fileInput(), fileOf('foto.jpg', 'image/jpeg'));
    expect(screen.queryByText('winget install Gyan.FFmpeg')).not.toBeInTheDocument();
    expect(convertButton()).toBeEnabled();
  });

  it('erros do agente aparecem e formatos desconhecidos são avisados', async () => {
    const user = userEvent.setup();
    const { agent } = mediaAgent();
    agent.route('POST', '/media/convert', () => {
      throw new Error('Arquivo grande demais (limite de 20 GB).');
    });
    renderWidget(fileConverterWidget, { agent });
    await screen.findByText('Os arquivos convertidos aparecem aqui.');

    await user.upload(fileInput(), fileOf('planilha.xlsx'));
    expect(screen.getByText(/Formato .xlsx não suportado/)).toBeInTheDocument();

    await user.click(screen.getByLabelText('Trocar arquivo'));
    await user.upload(fileInput(), fileOf('foto.png', 'image/png'));
    await user.click(convertButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Arquivo grande demais (limite de 20 GB).');
  });

  it('lembra o modo, a compactação e o formato por tipo', async () => {
    const user = userEvent.setup();
    const storage = new MemoryStorage();
    const { agent } = mediaAgent();
    const view = renderWidget(fileConverterWidget, { agent, storage });
    await screen.findByText('Os arquivos convertidos aparecem aqui.');
    await user.upload(fileInput(), fileOf('foto.png', 'image/png'));
    await user.selectOptions(screen.getByLabelText('Formato de saída'), 'webp');
    await user.click(screen.getByRole('button', { name: 'Ambos' }));
    await user.selectOptions(screen.getByLabelText('Compactação'), 'high');

    await waitFor(async () => expect(await storage.get('options')).toMatchObject({ mode: 'both', level: 'high', targets: { image: 'webp' } }));
    view.reload();
    await screen.findByText('Os arquivos convertidos aparecem aqui.');
    await user.upload(fileInput(), fileOf('outra.jpg', 'image/jpeg'));
    expect(screen.getByLabelText('Formato de saída')).toHaveValue('webp');
    expect(screen.getByLabelText('Compactação')).toHaveValue('high');
    expect(screen.getByRole('button', { name: 'Ambos' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('configura a pasta de saída', async () => {
    const user = userEvent.setup();
    const { agent, state } = mediaAgent();
    renderWidget(fileConverterWidget, { agent });
    expect(await screen.findByText(/Salva em C:\\Users\\eu\\Downloads\\Dashboard/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Configurações do conversor' }));
    const input = screen.getByLabelText('Pasta dos arquivos convertidos');
    await user.clear(input);
    await user.type(input, 'D:\\Convertidos');
    await user.click(screen.getByRole('button', { name: 'Salvar pasta' }));
    await waitFor(() => expect(state.settings.convertDir).toBe('D:\\Convertidos'));
    expect(screen.getByText(/Salva em D:\\Convertidos/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Abrir pasta de saída' }));
    expect(agent.requests).toContainEqual({ path: '/media/open-directory', method: 'POST', body: { which: 'convert' } });
  });
});
