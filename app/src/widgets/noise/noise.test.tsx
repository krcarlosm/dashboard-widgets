import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { noiseWidget } from './index';
import { MemoryStorage, renderWidget } from '../../test/harness';

// Web Audio falso: registra o que o widget criou e o volume aplicado.
class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state = 'running';
  currentTime = 0;
  sampleRate = 8000;
  destination = {};
  closed = false;
  gain = { value: 0, setValueAtTime: vi.fn((v: number) => (this.gain.value = v)), linearRampToValueAtTime: vi.fn((v: number) => (this.gain.value = v)) };
  source = { buffer: null as any, loop: false, connect: vi.fn(), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn() };
  constructor() {
    FakeAudioContext.instances.push(this);
  }
  resume = vi.fn();
  close = vi.fn(() => (this.closed = true));
  createGain = () => ({ gain: this.gain, connect: vi.fn(), disconnect: vi.fn() });
  createBuffer = (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) });
  createBufferSource = () => this.source;
}

beforeEach(() => {
  FakeAudioContext.instances = [];
  (window as any).AudioContext = FakeAudioContext;
  vi.useFakeTimers();
});
afterEach(() => {
  delete (window as any).AudioContext;
});

const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
const playButton = () => screen.getAllByRole('button').find((button) => button.querySelector('svg') && !button.title && !button.textContent)!;

describe('Gerador de Ruído', () => {
  it('toca em loop com o volume salvo e para com fade', async () => {
    const storage = new MemoryStorage();
    await storage.set('volume', 80);
    await storage.set('noiseType', 'pink');
    renderWidget(noiseWidget, { storage });
    await flush();
    expect(screen.getByText('80%')).toBeInTheDocument();

    await act(async () => { fireEvent.click(playButton()); });
    const audio = FakeAudioContext.instances[0];
    expect(audio.source.loop).toBe(true);
    expect(audio.source.start).toHaveBeenCalled();
    expect(audio.gain.value).toBeCloseTo(0.48); // 80% de 0.6

    await act(async () => { fireEvent.click(playButton()); });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(audio.closed).toBe(true);
  });

  it('volume e tipo são salvos', async () => {
    const view = renderWidget(noiseWidget);
    await flush();
    await act(async () => { fireEvent.change(screen.getByRole('slider'), { target: { value: '20' } }); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Brown/ })); });
    expect(view.storage.data.get('volume')).toBe(20);
    expect(view.storage.data.get('noiseType')).toBe('brown');
  });

  it('temporizador desliga o som ao terminar', async () => {
    renderWidget(noiseWidget);
    await flush();
    await act(async () => { fireEvent.click(screen.getByTitle('Configurações de Temporizador')); });
    await act(async () => { fireEvent.click(screen.getByRole('checkbox')); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '5 min' })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Concluído/ })); });

    await act(async () => { fireEvent.click(playButton()); });
    expect(screen.getByText('05:00')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(screen.getByText('04:00')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(4 * 60_000 + 500); });
    expect(FakeAudioContext.instances[0].closed).toBe(true);
    expect(screen.queryByText('00:00')).not.toBeInTheDocument();
  });

  it('remover o widget com som tocando libera o áudio', async () => {
    const view = renderWidget(noiseWidget);
    await flush();
    await act(async () => { fireEvent.click(playButton()); });
    view.unmount();
    expect(FakeAudioContext.instances[0].closed).toBe(true);
  });
});
