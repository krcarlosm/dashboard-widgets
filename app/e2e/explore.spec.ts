import { test } from '@playwright/test';
import type { Page } from '@playwright/test';

// Roteiro exploratório (não roda por padrão): coloca todos os widgets no canvas e
// tira capturas em tema escuro/claro e densidade compacta para revisão visual.
//   EXPLORE=1 npx playwright test explore --project=edge
// As imagens ficam em test-results/explore/.

test.skip(!process.env.EXPLORE, 'roteiro exploratório: defina EXPLORE=1');

const WIDGETS = [
  'Hello World SDK', 'Anotações Rápidas', 'Timer Multiferramenta', 'Lista de Tarefas', 'Gerador de Ruído', 'Mini-Kanban',
  'Gerenciador de Snippets', 'Conversor de Unidades', 'Calculadora de Datas', 'Regra de Três', 'Baú de Lembranças', 'Top 10 Arquivos da Semana',
];

async function addWidget(page: Page, name: string) {
  const card = page.locator('div').filter({ has: page.getByText(name, { exact: true }) }).filter({ has: page.getByTitle('Adicionar nova instância ao canvas') }).last();
  await card.getByTitle('Adicionar nova instância ao canvas').click();
}

async function setAppearance(page: Page, button: string) {
  await page.getByTitle('Meu Perfil').click();
  await page.getByRole('button', { name: button, exact: true }).last().click();
  await page.getByRole('button', { name: 'Fechar' }).click();
}

test('todos os widgets em escuro, claro e compacto', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1920, height: 1300 });
  await page.goto('/');
  await page.getByText('Agent respondendo corretamente').waitFor();
  for (const name of WIDGETS) await addWidget(page, name);
  await page.getByRole('button', { name: 'Reorganizar' }).first().click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/explore/1-escuro.png', fullPage: true });

  await setAppearance(page, 'Claro');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/explore/2-claro.png', fullPage: true });

  await setAppearance(page, 'Compacto');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/explore/3-claro-compacto.png', fullPage: true });
});
