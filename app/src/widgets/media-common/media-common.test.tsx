import { describe, expect, it } from 'vitest';
import { describeJob, formatBytes, formatDuration } from './index';
import { mediaJob } from '../../test/mediaAgent';

describe('Formatação das tarefas de mídia', () => {
  it('tamanhos e durações', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1,5 KB');
    expect(formatBytes(734_003_200)).toBe('700 MB');
    expect(formatBytes(null)).toBe('');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatDuration(null)).toBe('');
  });

  it('descreve cada estado', () => {
    expect(describeJob(mediaJob({ status: 'queued' }) as any)).toBe('Na fila');
    expect(describeJob(mediaJob({ status: 'running', stage: '', progress: null }) as any)).toBe('Em andamento');
    expect(describeJob(mediaJob({ status: 'processing', stage: 'Processando' }) as any)).toBe('Processando…');
    expect(
      describeJob(mediaJob({ status: 'done', outputs: [{ path: 'a', name: 'a', size: 1024 }, { path: 'b', name: 'b', size: 1024 }] }) as any),
    ).toBe('Concluído · 2 arquivos · 2 KB');
    expect(describeJob(mediaJob({ status: 'canceled' }) as any)).toBe('Cancelado');
    expect(describeJob(mediaJob({ status: 'error', error: 'Vídeo privado.' }) as any)).toBe('Vídeo privado.');
  });
});
