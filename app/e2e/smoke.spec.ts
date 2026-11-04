import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// Cada teste roda num perfil novo do Firefox (localStorage e IndexedDB vazios),
// contra o agente isolado definido em playwright.config.ts.

const backupsDir = () => path.join(process.env.DASHBOARD_E2E_DIR!, 'backups');
const backupFiles = (prefix: string) => (fs.existsSync(backupsDir()) ? fs.readdirSync(backupsDir()).filter((name) => name.startsWith(prefix)) : []);

async function addWidget(page: Page, name: string) {
  const card = page
    .locator('div')
    .filter({ has: page.getByText(name, { exact: true }) })
    .filter({ has: page.getByTitle('Adicionar nova instância ao canvas') })
    .last();
  await card.getByTitle('Adicionar nova instância ao canvas').click();
}

async function openApp(page: Page) {
  await page.goto('/');
  await expect(page.getByText('Agent respondendo corretamente')).toBeVisible();
}

test('abre com o agente conectado e mostra a versão do app', async ({ page }) => {
  await openApp(page);
  await expect(page.getByText(/^Widgets Locais v\d+\.\d+\.\d+$/)).toBeVisible();
});

test('anotações persistem após recarregar', async ({ page }) => {
  await openApp(page);
  await addWidget(page, 'Anotações Rápidas');
  await page.getByPlaceholder('Escreva suas anotações aqui...').fill('Ligar para o fornecedor às 15h');
  await expect(page.getByTitle(/^Salvo às/)).toBeVisible(); // no tamanho padrão o rodapé é compacto
  await page.reload();
  await expect(page.getByPlaceholder('Escreva suas anotações aqui...')).toHaveValue('Ligar para o fornecedor às 15h');
});

test('tarefas: adicionar, concluir e manter após recarregar', async ({ page }) => {
  await openApp(page);
  await addWidget(page, 'Lista de Tarefas');
  const input = page.getByPlaceholder('Adicionar nova tarefa...');
  await input.fill('Revisar contrato');
  await input.press('Enter');
  await input.fill('Enviar relatório');
  await input.press('Enter');
  await page.getByRole('checkbox', { name: 'Concluir "Revisar contrato"' }).click();
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Reabrir "Revisar contrato"' })).toBeVisible();
  await expect(page.getByText('1 / 2 concluídas')).toBeVisible();
});

test('tema claro é aplicado e lembrado', async ({ page }) => {
  await openApp(page);
  await page.getByTitle('Meu Perfil').click();
  await page.getByRole('button', { name: 'Claro' }).click();
  await page.getByRole('button', { name: 'Fechar' }).click();
  const background = () => page.locator('#root > div').first().evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await background()).toBe('rgb(248, 250, 252)');
  await page.reload();
  expect(await background()).toBe('rgb(248, 250, 252)');
});

test('Reset Global pede confirmação e salva backup antes de apagar', async ({ page }) => {
  await openApp(page);
  await addWidget(page, 'Anotações Rápidas');
  await page.getByPlaceholder('Escreva suas anotações aqui...').fill('não pode sumir sem aviso');
  await expect(page.getByTitle(/^Salvo às/)).toBeVisible(); // no tamanho padrão o rodapé é compacto
  const manualBefore = backupFiles('manual-').length;

  await page.getByRole('button', { name: /Reset Global/ }).click();
  await page.getByRole('alertdialog', { name: 'Reset Global' }).getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByPlaceholder('Escreva suas anotações aqui...')).toHaveValue('não pode sumir sem aviso');

  await page.getByRole('button', { name: /Reset Global/ }).click();
  await page.getByRole('alertdialog', { name: 'Reset Global' }).getByRole('button', { name: 'Apagar tudo' }).click();
  await expect(page.getByPlaceholder('Escreva suas anotações aqui...')).toHaveCount(0);
  expect(backupFiles('manual-').length).toBe(manualBefore + 1);
});

test('backup automático é feito ao abrir quando está pendente', async ({ page }) => {
  await openApp(page);
  await addWidget(page, 'Hello World SDK'); // cria o perfil
  // Testes anteriores já podem ter feito o backup do horário: volta ao estado "pendente".
  backupFiles('auto-').forEach((name) => fs.unlinkSync(path.join(backupsDir(), name)));
  await page.reload();
  await expect.poll(() => backupFiles('auto-').length, { timeout: 10_000 }).toBe(1);

  await page.getByTitle('Meu Perfil').click();
  await expect(page.getByText(/Último automático: \d{2}\/\d{2}/)).toBeVisible();
  await expect(page.getByText(/Falha no último backup/)).toHaveCount(0);
});

test('Baú e Top 10 funcionam com o agente', async ({ page }) => {
  await openApp(page);
  await addWidget(page, 'Baú de Lembranças');
  await addWidget(page, 'Top 10 Arquivos da Semana');
  await expect(page.getByPlaceholder('Buscar nos textos copiados...')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Editados' })).toBeVisible();
  await expect(page.getByText(/não está disponível/)).toHaveCount(0);
});

test('sem agente, os widgets que dependem dele avisam', async ({ page }) => {
  await page.routeWebSocket(/:5299\//, (ws) => ws.close());
  await page.route(/127\.0\.0\.1:5299/, (route) => route.abort());
  await page.goto('/');
  await addWidget(page, 'Baú de Lembranças');
  await addWidget(page, 'Top 10 Arquivos da Semana');
  await expect(page.getByText(/O Agent não está disponível\. Inicie o serviço local para ver o Baú/)).toBeVisible();
  await expect(page.getByText(/ver os arquivos da semana/)).toBeVisible();
  // Widgets locais continuam funcionando normalmente.
  await addWidget(page, 'Regra de Três');
  await page.getByPlaceholder('A', { exact: true }).fill('2');
  await page.getByPlaceholder('B', { exact: true }).fill('10');
  await page.getByPlaceholder('C', { exact: true }).fill('5');
  await expect(page.getByTitle('Clique para copiar')).toHaveText('25');
});

test('seletores não transbordam em widgets estreitos', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openApp(page);
  for (const name of ['Gerador de Ruído', 'Timer Multiferramenta', 'Anotações Rápidas', 'Lista de Tarefas']) await addWidget(page, name);
  await page.waitForTimeout(500);
  const overflowing = await page.locator('[role="group"]').evaluateAll((groups) =>
    groups
      // Transborda na largura ou foi achatado na altura (botões com menos de 18 px).
      .filter((group) => group.scrollWidth > group.clientWidth + 1 || group.getBoundingClientRect().height < 18)
      .map((group) => group.getAttribute('aria-label')),
  );
  expect(overflowing).toEqual([]);
  // Rótulo escondido continua acessível pelo nome do botão.
  await expect(page.getByRole('button', { name: 'Pink' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Crono' })).toBeVisible();
});

test('barra lateral compacta mantém o logo inteiro', async ({ page }) => {
  await openApp(page);
  await page.getByTitle('Modo compacto').click();
  const logo = page.getByTitle('Recolher sidebar').locator('xpath=preceding-sibling::div[1]');
  await expect(logo).toBeVisible();
  const box = await logo.boundingBox();
  expect(Math.round(box!.width)).toBe(30);
  expect(Math.round(box!.height)).toBe(30);
});

test('card clicado fica por cima dos vizinhos', async ({ page }) => {
  await openApp(page);
  await addWidget(page, 'Regra de Três');
  await addWidget(page, 'Calculadora de Datas');
  const items = page.locator('[data-widget-instance-id]');
  await items.nth(0).click({ position: { x: 40, y: 60 } });
  await expect(items.nth(0)).toHaveCSS('z-index', '20');
  await expect(items.nth(1)).toHaveCSS('z-index', '1');
  await items.nth(1).click({ position: { x: 40, y: 60 } });
  await expect(items.nth(1)).toHaveCSS('z-index', '20');
  await expect(items.nth(0)).toHaveCSS('z-index', '1');
});
