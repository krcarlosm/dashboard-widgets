import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ruleOfThreeWidget } from './index';
import { renderWidget } from '../../test/harness';

const fill = (values: Record<'A' | 'B' | 'C', string>) => {
  (Object.keys(values) as ('A' | 'B' | 'C')[]).forEach((key) => {
    fireEvent.change(screen.getByPlaceholderText(key), { target: { value: values[key] } });
  });
};

describe('Regra de Três', () => {
  it('calcula X = B × C / A', () => {
    renderWidget(ruleOfThreeWidget);
    fill({ A: '2', B: '10', C: '5' });
    expect(screen.getByTitle('Clique para copiar')).toHaveTextContent('25');
    expect(screen.getByText('X = (B × C) / A = (10 × 5) / 2 = 25')).toBeInTheDocument();
  });

  it('A = 0 ou campo vazio não gera resultado', () => {
    renderWidget(ruleOfThreeWidget);
    fill({ A: '0', B: '10', C: '5' });
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copiar resultado/ })).toBeDisabled();
  });

  it('formata dízimas e números muito pequenos', () => {
    renderWidget(ruleOfThreeWidget);
    fill({ A: '3', B: '1', C: '1' });
    expect(screen.getByTitle('Clique para copiar')).toHaveTextContent('0.3333333333');
    fill({ A: '1000000', B: '0.00001', C: '1' });
    expect(screen.getByTitle('Clique para copiar')).toHaveTextContent('1.000000e-11');
  });

  it('copia o resultado e limpa os campos', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    renderWidget(ruleOfThreeWidget);
    fill({ A: '4', B: '8', C: '3' });
    await user.click(screen.getByRole('button', { name: /Copiar resultado/ }));
    expect(writeText).toHaveBeenCalledWith('6');
    await user.click(screen.getByRole('button', { name: 'Limpar campos' }));
    expect(screen.getByPlaceholderText('A')).toHaveValue(null);
  });
});
