import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { pomodoroWidget } from './index';
import { MemoryStorage, renderWidget } from '../../test/harness';

// Fake timers controlam Date.now e setInterval (inclusive o dublê do Worker).
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const click = (title: string) => act(() => { fireEvent.click(screen.getByTitle(title)); });

describe('Timer Multiferramenta', () => {
  it('Pomodoro: foco de 25 min vira pausa curta e conta o ciclo', async () => {
    renderWidget(pomodoroWidget);
    await flush();
    expect(screen.getByText('25:00')).toBeInTheDocument();
    click('Iniciar');
    await advance(60_000);
    expect(screen.getByText('24:00')).toBeInTheDocument();
    await advance(24 * 60_000);
    expect(screen.getByText('Pausa Curta')).toBeInTheDocument();
    expect(screen.getByText('05:00')).toBeInTheDocument();
    expect(screen.getByText('1', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByTitle('Iniciar')).toBeInTheDocument(); // para ao terminar a fase
  });

  it('Pomodoro: 4º ciclo leva à pausa longa', async () => {
    const storage = new MemoryStorage();
    await storage.set('completedCycles', 3);
    await storage.set('remainingSeconds', 2);
    renderWidget(pomodoroWidget, { storage });
    await flush();
    click('Iniciar');
    await advance(3000);
    expect(screen.getByText('Pausa Longa')).toBeInTheDocument();
    expect(screen.getByText('15:00')).toBeInTheDocument();
  });

  it('o tempo segue o relógio mesmo se os ticks atrasarem (aba em segundo plano)', async () => {
    renderWidget(pomodoroWidget);
    await flush();
    click('Iniciar');
    // Simula 10 min sem nenhum tick (timer estrangulado/computador suspenso)...
    vi.setSystemTime(Date.now() + 10 * 60_000);
    // ...e o próximo tick já mostra o tempo certo.
    await advance(1000);
    expect(screen.getByText('14:59')).toBeInTheDocument();
  });

  it('restaura fase, ciclos e tempo após recarregar', async () => {
    const storage = new MemoryStorage();
    await storage.set('phase', 'short_break');
    await storage.set('completedCycles', 2);
    await storage.set('remainingSeconds', 125);
    const view = renderWidget(pomodoroWidget, { storage });
    await flush();
    expect(screen.getByText('Pausa Curta')).toBeInTheDocument();
    expect(screen.getByText('02:05')).toBeInTheDocument();
    expect(storage.data.get('completedCycles')).toBe(2); // não foi sobrescrito pelos padrões

    view.reload();
    await flush();
    expect(screen.getByText('02:05')).toBeInTheDocument();
  });

  it('pular fase e resetar', async () => {
    renderWidget(pomodoroWidget);
    await flush();
    click('Iniciar');
    await advance(5000);
    click('Resetar');
    expect(screen.getByText('25:00')).toBeInTheDocument();
    click('Pular fase');
    expect(screen.getByText('Pausa Curta')).toBeInTheDocument();
    click('Pular fase');
    expect(screen.getByText('Foco')).toBeInTheDocument();
  });

  it('configurações mudam a duração e são salvas', async () => {
    const view = renderWidget(pomodoroWidget);
    await flush();
    click('Configurações');
    act(() => {
      fireEvent.change(screen.getByLabelText('Foco:'), { target: { value: '50' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    });
    expect(screen.getByText('50:00')).toBeInTheDocument();
    expect(view.storage.data.get('config')).toMatchObject({ focusMinutes: 50 });
  });

  it('Contagem: define 0:03, termina e para', async () => {
    renderWidget(pomodoroWidget);
    await flush();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Contagem/ }));
    });
    const [minutes, seconds] = screen.getAllByRole('spinbutton');
    act(() => {
      fireEvent.change(minutes, { target: { value: '0' } });
      fireEvent.change(seconds, { target: { value: '3' } });
      fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    });
    expect(screen.getByText('00:03')).toBeInTheDocument();
    click('Iniciar');
    await advance(4000);
    expect(screen.getByText('00:00')).toBeInTheDocument();
    expect(screen.getByTitle('Iniciar')).toBeInTheDocument();
  });

  it('Cronômetro: mede pelo relógio, pausa e zera', async () => {
    renderWidget(pomodoroWidget);
    await flush();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Crono/ }));
    });
    click('Iniciar');
    await advance(1500);
    expect(screen.getByText('00:01.50')).toBeInTheDocument();
    vi.setSystemTime(Date.now() + 60_000); // aba em segundo plano: nenhum intervalo roda
    await advance(50);
    expect(screen.getByText('01:01.55')).toBeInTheDocument();
    click('Pausar');
    await advance(5000);
    expect(screen.getByText('01:01.55')).toBeInTheDocument();
    click('Resetar');
    expect(screen.getByText('00:00.00')).toBeInTheDocument();
  });

  it('não troca de modo com o timer rodando', async () => {
    renderWidget(pomodoroWidget);
    await flush();
    click('Iniciar');
    expect(screen.getByRole('button', { name: /Crono/ })).toBeDisabled();
  });
});
