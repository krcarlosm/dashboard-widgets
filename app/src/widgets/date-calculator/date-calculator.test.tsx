import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dateCalculatorWidget, dateDifference } from './index';
import { renderWidget } from '../../test/harness';

const dateInputs = () => Array.from(document.querySelectorAll('input[type="date"]')) as HTMLInputElement[];

describe('Calculadora de Datas — cálculo', () => {
  it('roda no fuso de Brasília (pré-condição dos casos abaixo)', () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(180);
  });

  it.each([
    ['2026-01-01', '2026-01-31', { days: 30, weeks: 4.29, months: 0 }],
    ['2026-02-01', '2026-03-01', { days: 28, weeks: 4, months: 1 }], // falhava em UTC−3
    ['2026-01-31', '2026-02-28', { days: 28, weeks: 4, months: 0 }],
    ['2026-03-31', '2026-01-15', { days: 75, weeks: 10.71, months: 2 }], // ordem invertida
    ['2024-02-29', '2025-02-28', { days: 365, weeks: 52.14, months: 11 }],
  ])('%s → %s', (a, b, expected) => {
    expect(dateDifference(a, b)).toEqual(expected);
  });

  it('datas inválidas não geram resultado', () => {
    expect(dateDifference('', '2026-01-01')).toBeNull();
    expect(dateDifference('2026-13-45x', '2026-01-01')).toBeNull();
  });
});

describe('Calculadora de Datas — widget', () => {
  it('"hoje" usa a data local, mesmo depois das 21h (UTC já é o dia seguinte)', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 30, 22, 30)); // 30/10 22:30 em Brasília = 31/10 01:30 UTC
    renderWidget(dateCalculatorWidget);
    expect(dateInputs()[0]).toHaveValue('2026-10-30');
  });

  it('mostra dias, semanas e meses e filtra por unidade', async () => {
    const user = userEvent.setup();
    renderWidget(dateCalculatorWidget);
    const [start, end] = dateInputs();
    fireEvent.change(start, { target: { value: '2026-02-01' } });
    fireEvent.change(end, { target: { value: '2026-03-01' } });
    expect(screen.getByText('28')).toBeInTheDocument();
    expect(screen.getByText('Meses (aprox.)').nextSibling).toHaveTextContent('1');
    expect(screen.getByText('2026-02-01 → 2026-03-01')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sem.' }));
    expect(screen.queryByText('Dias', { selector: 'div' })).not.toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('copia um valor', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    renderWidget(dateCalculatorWidget);
    const [start, end] = dateInputs();
    fireEvent.change(start, { target: { value: '2026-01-01' } });
    fireEvent.change(end, { target: { value: '2026-01-11' } });
    await user.click(screen.getAllByTitle('Copiar')[0]);
    expect(writeText).toHaveBeenCalledWith('10');
  });
});
