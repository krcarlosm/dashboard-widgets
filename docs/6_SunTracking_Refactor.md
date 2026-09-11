# Sun Tracking: plano de implementação

> Status: nova feature em desenvolvimento. Este documento define o escopo e a sequência de implementação; ele não representa que a feature já esteja concluída.

## 1. Objetivo

Adicionar ao canvas um efeito visual de passagem do tempo. A posição vertical do foco do gradiente deverá avançar conforme o horário local do sistema, dentro de um intervalo configurável pelo usuário.

A posição será calculada como uma porcentagem:

- antes do início configurado: `0%`;
- depois do fim configurado: `100%`;
- entre os dois horários: progresso linear do intervalo transcorrido.

A posição será recalculada **a cada 30 minutos**, e também imediatamente na montagem do canvas e no retorno da janela ao primeiro plano.

## 2. Decisões de arquitetura

### 2.1 Variável CSS para a posição focal

`themeGradients.ts` deverá trocar a posição fixa `0%` por `var(--focal-y, 0%)` em todos os presets e temas.

Exemplo:

```ts
'dark': 'radial-gradient(circle at 50% var(--focal-y, 0%), #334155 0%, #1e293b 40%, #0f172a 100%)'
```

O `Canvas` deverá fornecer `--focal-y` no estilo do elemento `main`. O fallback `0%` garante um estado visual válido caso a variável ainda não tenha sido definida.

Não será recriada a string completa do gradiente a cada atualização. Somente o valor da propriedade CSS será alterado.

### 2.2 Fonte dos horários

Os horários serão preferências da aparência do perfil, e não constantes no código nem arquivo `.config` externo.

A escolha do menu de perfil é adequada porque:

- `ProfileModal.tsx` já concentra as preferências do usuário;
- `dashboardStore.ts` já persiste a aparência no `localStorage`;
- `ProfileManifest` já transporta as configurações de aparência;
- a configuração permanece local, portátil e compatível com a execução atual no navegador.

Um arquivo `.config` não será usado nesta primeira versão. Um frontend Vite não consegue ler silenciosamente um arquivo arbitrário do disco. Essa alternativa exigiria empacotamento desktop, seletor de arquivo ou uma API adicional no agente Python.

## 3. Alterações planejadas por arquivo

### 3.1 `app/src/types/profile.ts`

Estender `ProfileAppearance` com:

```ts
workdayStart: string;
workdayEnd: string;
```

Os valores serão strings no formato `HH:mm`, compatíveis com `<input type="time">` e fáceis de transportar em exportações de perfil.

### 3.2 `app/src/store/dashboardStore.ts`

Adicionar os padrões:

```ts
workdayStart: '07:00',
workdayEnd: '17:00',
```

Atualizar `normalizeAppearance` para:

1. aceitar somente horários válidos no formato `HH:mm`;
2. aplicar `07:00` e `17:00` quando os campos não existirem, preservando perfis antigos;
3. rejeitar valores impossíveis, como `25:00`, `10:75` ou strings arbitrárias;
4. rejeitar `workdayStart >= workdayEnd`;
5. retornar os padrões quando a configuração for inválida.

A validação deverá ficar em uma função reutilizável, por exemplo `parseTimeToMinutes`, evitando que a lógica de conversão seja duplicada no modal e no canvas.

Atualizar também `loadProfile`, `saveProfile` e `resetDashboard` para carregar, persistir e restaurar os dois horários.

### 3.3 `app/src/components/ProfileModal.tsx`

Adicionar dois campos de horário na seção de aparência:

- início do período: `input type="time"`;
- fim do período: `input type="time"`.

Ao alterar um campo, usar `setAppearance` para persistir a preferência pelo fluxo já existente.

A interface deverá impedir ou sinalizar combinações inválidas. O estado persistido nunca deverá aceitar o intervalo invertido, mesmo que um valor seja alterado antes do outro. A mensagem de validação deve explicar que o horário inicial precisa ser anterior ao horário final.

### 3.4 `app/src/components/themeGradients.ts`

Substituir a posição estática `0%` pela variável CSS `var(--focal-y, 0%)` em todos os gradientes existentes.

Não alterar as cores, os presets ou os tipos públicos sem necessidade. O preset ativo deverá continuar vindo do Zustand; não deverá ser substituído por `const activePreset = 'default'`.

### 3.5 `app/src/components/Canvas.tsx`

O canvas deverá:

1. ler `canvasPreset`, `theme`, `density`, `workdayStart` e `workdayEnd` do store;
2. converter os horários para minutos;
3. calcular o foco usando o horário local retornado por `new Date()`;
4. limitar o resultado a `0%` e `100%` fora do intervalo;
5. atualizar o estado visual imediatamente ao montar;
6. atualizar a cada 30 minutos (`30 * 60 * 1000`);
7. recalcular ao receber `visibilitychange` quando o documento voltar a ficar visível;
8. limpar o intervalo e os listeners no unmount;
9. manter o `canvasPreset` selecionado pelo usuário;
10. aplicar `--focal-y` no estilo do `main`.

A função de cálculo deverá ser pura e receber o horário atual e os limites em minutos. Isso permitirá testá-la sem depender do relógio real do sistema.

Exemplo conceitual:

```ts
function calculateFocalY(
  timeInMinutes: number,
  startMinutes: number,
  endMinutes: number,
): string {
  if (timeInMinutes <= startMinutes) return '0%';
  if (timeInMinutes >= endMinutes) return '100%';

  const progress = ((timeInMinutes - startMinutes) / (endMinutes - startMinutes)) * 100;
  return `${progress.toFixed(2)}%`;
}
```

A função deverá ser chamada somente depois de os horários terem sido validados. Ainda assim, deve possuir proteção contra intervalo nulo ou invertido para evitar divisão por zero.

## 4. Erros e riscos mitigados

### 4.1 Preset do canvas sobrescrito

O snippet original define `const activePreset: CanvasPreset = 'default'`. Isso ignoraria o preset já selecionado no perfil. O plano mantém `canvasPreset` vindo do Zustand, evitando regressão visual e perda da preferência do usuário.

### 4.2 Horários fixos no código

Os valores `7 * 60` e `17 * 60` impedem adaptação a diferentes jornadas ou preferências. Os horários passarão a fazer parte do perfil e serão editáveis no menu de configurações.

### 4.3 Divisão por zero e intervalo invertido

Se início e fim forem iguais, o cálculo produziria `NaN`. Se o início for posterior ao fim, o progresso ficaria semanticamente incorreto. A normalização e a função de cálculo terão validação em duas camadas.

### 4.4 Perfis existentes incompatíveis

Perfis salvos antes da feature não terão os novos campos. A normalização preencherá os valores ausentes com `07:00` e `17:00`, evitando quebra na leitura do `localStorage`.

### 4.5 Aba suspensa ou computador em suspensão

`setInterval` não é uma garantia de execução pontual quando a aba fica em segundo plano ou o sistema suspende. O recalculo na montagem e no evento `visibilitychange` corrige o valor assim que o canvas volta a ser exibido.

### 4.6 Relógio ou fuso horário do sistema

A feature usa deliberadamente o horário local de `new Date()`. Se o relógio ou fuso do sistema estiver incorreto, o efeito também estará. Isso é uma limitação conhecida da proposta, não um erro silencioso da aplicação; não será introduzida uma dependência de horário externo nesta versão.

### 4.7 Atualização excessiva

A proposta inicial mencionava atualizações muito frequentes. A taxa definida para esta feature será de 30 minutos, suficiente para o efeito visual e com menor custo de renderização. O valor continua sendo corrigido ao abrir ou retornar à aplicação.

### 4.8 Atualização da string do gradiente

Recriar todos os gradientes em cada mudança de horário aumentaria o trabalho do React sem necessidade. A variável CSS altera apenas a posição focal e mantém o mapa de gradientes estável.

## 5. Regras funcionais

- O intervalo padrão é `07:00` a `17:00`.
- Antes do início, o foco fica em `0%`.
- Depois do fim, o foco fica em `100%`.
- Dentro do intervalo, o progresso é linear.
- A atualização automática ocorre a cada 30 minutos.
- A aplicação recalcula ao montar e ao voltar a ficar visível.
- O horário usado é o local do sistema.
- Horários inválidos não são persistidos.
- Perfis antigos continuam válidos com os padrões novos.
- O efeito funciona com qualquer combinação existente de tema e preset.

## 6. Estratégia de testes e validação

### 6.1 Testes da função de cálculo

Cobrir pelo menos:

- antes do início;
- exatamente no início;
- no ponto intermediário;
- exatamente no fim;
- depois do fim;
- início igual ao fim;
- início posterior ao fim;
- horários com minutos diferentes, como `07:30` e `16:45`.

### 6.2 Testes do perfil

Verificar:

- carregamento de perfil antigo sem os novos campos;
- persistência de horários válidos;
- rejeição de formato inválido;
- rejeição de intervalo invertido;
- restauração dos padrões em `resetDashboard`.

### 6.3 Validação de integração

Executar na pasta `app`:

```powershell
npm run build
```

Também verificar manualmente:

1. trocar o preset e confirmar que ele permanece ativo;
2. alterar os horários no perfil e recarregar a aplicação;
3. testar canvas vazio e canvas com widgets;
4. ocultar e reexibir a aba;
5. alternar tema claro/escuro;
6. confirmar que não há erro no console.

## 7. Critérios de aceite

A feature será considerada pronta quando:

- o foco do gradiente refletir o horário local configurado;
- o intervalo padrão funcionar sem configuração manual;
- o usuário conseguir alterar os horários no menu de perfil;
- perfis anteriores carregarem sem erro;
- o preset do canvas não for alterado pelo Sun Tracking;
- a atualização ocorrer a cada 30 minutos e após retorno à aba;
- intervalos inválidos forem rejeitados;
- `npm run build` finalizar sem erros;
- os testes da função de cálculo e da persistência passarem.

## 8. Ordem de implementação

1. Atualizar os tipos de perfil e os valores padrão.
2. Implementar validação e normalização dos horários.
3. Persistir os novos campos no Zustand e no `ProfileManifest`.
4. Adicionar os campos de horário ao `ProfileModal`.
5. Atualizar os gradientes para usar `--focal-y`.
6. Implementar a função pura de cálculo.
7. Integrar o cálculo ao `Canvas` com intervalo de 30 minutos e `visibilitychange`.
8. Criar e executar os testes unitários e de integração.
9. Executar `npm run build` e a validação manual.
10. Atualizar este documento quando a feature sair de desenvolvimento e for concluída.

## 9. Fora do escopo desta feature

- sincronização com nascer e pôr do sol reais;
- consulta a serviços externos de horário ou localização;
- configuração por arquivo `.config`;
- atualização contínua segundo a segundo;
- mudança automática do tema claro/escuro;
- alteração das cores dos presets existentes.
