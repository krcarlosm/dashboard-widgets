import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { unitConverterWidget } from './index';
import { renderWidget } from '../../test/harness';

const valueInput = () => screen.getByPlaceholderText('Digite o valor...');
const [from, to] = [0, 1].map((index) => () => screen.getAllByRole('combobox')[index]);

describe('Conversor de Unidades', () => {
  it('converte 1 m para pés por padrão', () => {
    renderWidget(unitConverterWidget);
    expect(screen.getByText('3.280839895')).toBeInTheDocument();
  });

  it('converte temperatura e troca o sentido', async () => {
    const user = userEvent.setup();
    renderWidget(unitConverterWidget);
    await user.click(screen.getByRole('button', { name: /Temperatura/ }));
    fireEvent.change(valueInput(), { target: { value: '100' } });
    expect(screen.getByText('212')).toBeInTheDocument(); // °C → °F
    await user.click(screen.getByTitle('Trocar sentido'));
    expect(from()).toHaveValue('F');
    expect(screen.getByText('37.77777778')).toBeInTheDocument(); // 100 °F → °C
    await user.selectOptions(to(), 'K');
    expect(screen.getByText('310.9277778')).toBeInTheDocument();
  });

  it('converte pressão (bar → psi)', async () => {
    const user = userEvent.setup();
    renderWidget(unitConverterWidget);
    await user.click(screen.getByRole('button', { name: /Pressão/ }));
    await user.selectOptions(from(), 'bar');
    await user.selectOptions(to(), 'psi');
    expect(screen.getByText('14.50377377')).toBeInTheDocument();
  });

  it('valor inválido não gera resultado nem permite copiar', () => {
    renderWidget(unitConverterWidget);
    fireEvent.change(valueInput(), { target: { value: '' } });
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copiar/ })).toBeDisabled();
  });

  it('copia o resultado', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    renderWidget(unitConverterWidget);
    await user.click(screen.getByRole('button', { name: /Copiar/ }));
    expect(writeText).toHaveBeenCalledWith('3.280839895');
    expect(screen.getByRole('button', { name: /Copiado!/ })).toBeInTheDocument();
  });
});
