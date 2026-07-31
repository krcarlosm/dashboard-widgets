# Fase 2 — Widgets MVP (sem dependência do Agent)

> Pré-requisito: Fase 1 concluída (Core Shell + Sistema de Status funcionando com Hello World e Contador de Cliques). Agent local em Python já com esqueleto funcional (FastAPI + WebSocket, handshake, ping/pong) — não será usado nesta fase, mas fica disponível para a Fase 3.

## Objetivo da Fase

Implementar os 4 widgets que **não dependem do Local Agent**: Notas, Pomodoro, To-do List e Gerador de Ruído. Ao final desta fase, o dashboard deve ser inteiramente funcional e útil no dia a dia mesmo sem o Agent rodando — esse é o Marco M1 definido no plano geral.

Cada widget entra no sistema com `status: "in_development"` por padrão (conforme o fluxo validado na Fase 1) e só é promovido para `stable` após passar pelo checklist de teste da própria seção.

---

## 1. Quadro de Anotações Rápidas

### Modelo de dados
```ts
interface NotesState {
  content: string;       // texto puro na v1 (Markdown fica no backlog)
  updatedAt: number;     // epoch ms, para eventual exibição de "última edição"
}
```
- Storage key: `widgetId:content` (uma única entrada, sem histórico de versões nesta fase)

### Comportamento
- `<textarea>` ocupando 100% do espaço disponível do widget
- Autosave com debounce de ~500ms após parar de digitar
- Sem limite de caracteres imposto pela UI (a Storage Layer que acuse se estourar quota do IndexedDB)

### Edge cases a cobrir
- Redimensionar o widget não deve perder o texto nem o cursor de edição em foco
- Colar texto muito grande (ex: >50k caracteres) não pode travar a UI — considerar debounce mais agressivo nesse caso

### Checklist de promoção para `stable`
- [ ] Autosave confirmado após reload
- [ ] Redimensionamento não interfere na digitação
- [ ] Dois widgets de Notas no canvas (se múltiplas instâncias forem permitidas) não cruzam conteúdo

---

## 2. Timer Pomodoro

### Modelo de dados
```ts
interface PomodoroConfig {
  focusMinutes: number;      // default 25
  shortBreakMinutes: number; // default 5
  longBreakMinutes: number;  // default 15
  cyclesUntilLongBreak: number; // default 4
}

interface PomodoroState {
  phase: "idle" | "focus" | "short_break" | "long_break";
  cycleCount: number;
  remainingSeconds: number;
  isRunning: boolean;
}
```
- Config e State em storage keys separadas (`widgetId:config`, `widgetId:state`) — config muda raramente, state muda a cada segundo, não faz sentido persistir os dois juntos a cada tick

### Comportamento
- Máquina de estados: `idle → focus → short_break → focus → ... → long_break → idle`
- Contagem regressiva rodando em **Web Worker** dedicado (evita drift quando a aba perde foco ou o navegador limita timers em background)
- `Notification API` disparada na troca de fase (pedir permissão apenas quando o usuário der o primeiro play, nunca no carregamento do app)
- Persistir `remainingSeconds` a cada ~5s (não a cada tick de 1s, para não sobrecarregar a Storage Layer) + sempre ao pausar/trocar de fase

### Edge cases a cobrir
- Fechar a aba com o timer rodando e reabrir: deve retomar de forma coerente (recalcular tempo decorrido pelo timestamp, não confiar cegamente no último `remainingSeconds` salvo)
- Dois timers Pomodoro no canvas ao mesmo tempo (se permitido) precisam de Workers isolados

### Checklist de promoção para `stable`
- [ ] Notificação dispara corretamente na troca de fase
- [ ] Nenhum drift perceptível após 25 minutos rodando com a aba em background
- [ ] Estado se recupera corretamente após fechar/reabrir o navegador com o timer em andamento

---

## 3. To-do List (Dia/Semana)

### Modelo de dados
```ts
interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  date: string; // ISO date (YYYY-MM-DD), dia ao qual a tarefa pertence
  createdAt: number;
}
```
- Storage key: `widgetId:items` (array completo — volume esperado é baixo, não precisa de paginação nesta fase)

### Comportamento
- Toggle de visão: **Hoje** (filtra `date === hoje`) / **Semana** (agrupa por dia dentro da semana corrente)
- CRUD simples: adicionar, marcar como concluída, editar texto, remover
- **Lógica de virada de dia:** ao abrir o app, comparar a data atual com a última data de acesso registrada (`widgetId:lastOpenedDate`). Se mudou o dia e existem itens de `done: false` do dia anterior, perguntar ao usuário: mover para hoje ou manter arquivado no dia original (a visão "Semana" continua mostrando o histórico de qualquer forma)

### Edge cases a cobrir
- Virada de dia com o app aberto (sem reload) — decidir se isso é tratado nesta fase ou fica para depois (recomendo: **não tratar nesta fase**, virada só é verificada no carregamento do app, igual à decisão já tomada para status de widget na Fase 1 — manter o app simples de raciocinar)
- Semana que cruza troca de mês/ano no agrupamento da visão Semana

### Checklist de promoção para `stable`
- [ ] Toggle Dia/Semana funciona corretamente perto da virada de semana (ex: testar numa segunda-feira e num domingo)
- [ ] Virada de dia pergunta corretamente sobre tarefas pendentes
- [ ] Persistência correta após reload em ambos os modos de visão

---

## 4. Gerador de White/Brown Noise

### Modelo de dados
```ts
interface NoiseState {
  type: "white" | "brown" | "pink";
  volume: number; // 0 a 1
  isPlaying: boolean;
}
```

### Comportamento
- Buffer de ruído gerado proceduralmente via `Web Audio API` (`AudioBufferSourceNode` com `loop = true`), sem depender de arquivos de áudio externos
- Diferenciação white/brown/pink via filtro (brown = passa-baixa acentuado sobre white noise; pink = filtro 1/f)
- Fade in/out de ~200ms ao dar play/pause, para evitar "clique" audível
- **Crítico:** `AudioContext` deve ser fechado explicitamente no `destroy()` do widget (remover do canvas ou fechar a aba) — Web Audio contexts vazados são uma fonte clássica de bug de performance em apps que ficam abertos por longos períodos

### Edge cases a cobrir
- Múltiplos widgets de ruído tocando ao mesmo tempo com tipos diferentes (deve ser permitido, cada um com seu próprio `AudioContext`)
- Trocar de tipo (white → brown) enquanto está tocando não deve gerar um "pop" audível

### Checklist de promoção para `stable`
- [ ] Loop contínuo sem cliques/gaps perceptíveis após alguns minutos
- [ ] `AudioContext` corretamente encerrado ao remover o widget (verificar via DevTools que não há contexto órfão)
- [ ] Volume e play/pause persistem entre reloads

---

## Critério de Aceite da Fase 2 (visão geral)

- Os 4 widgets funcionam de forma independente entre si e do Agent
- Todos passam pelo fluxo `in_development → validação → stable` já testado na Fase 1
- App é plenamente utilizável (Marco M1) mesmo com o processo do Agent Python desligado

---

## Diretivas para Suporte de IA Local

Caso você precise de apoio de outra IA rodando localmente para implementar algum destes widgets, use o bloco abaixo como instrução de contexto para ela. Ele resume as regras arquiteturais que **não podem ser quebradas**, independente de qual IA estiver ajudando.

```
CONTEXTO DO PROJETO
- App de dashboard modular de widgets, rodando localmente no navegador (React + TypeScript).
- Cada widget é um plugin isolado. NUNCA importar código de um widget dentro de outro.
- Stack já definida e travada: React + TypeScript, Zustand (estado), react-grid-layout
  (grid/drag/resize), Dexie.js sobre IndexedDB (Storage Layer). Não sugerir trocar essas
  escolhas nem introduzir novas dependências sem justificar explicitamente.

REGRAS OBRIGATÓRIAS DE IMPLEMENTAÇÃO
1. Todo widget deve implementar o Widget SDK Contract já definido:
   init(), render(), getConfig(), getExportableDefaults(), getUserData(),
   onResize(), destroy().
2. Todo acesso a dado persistido DEVE passar pela Storage Layer
   (storage.get(widgetId, key) / storage.set(widgetId, key, value)).
   PROIBIDO usar localStorage, sessionStorage ou qualquer storage direto do navegador.
3. Todo widget novo nasce com status "in_development" no manifest.json.
   NUNCA definir um widget novo como "stable" — essa mudança é manual, feita pelo
   desenvolvedor (usuário) só depois de passar pelo checklist de teste do widget.
4. Estrutura de pastas: cada widget vive isolado em /widgets/<widget-id>/, com
   pelo menos manifest.ts e index.tsx. Não criar arquivos de widget fora dessa pasta.
5. Cleanup é obrigatório: qualquer recurso que o widget abrir (Web Worker, AudioContext,
   WebSocket, listener global) TEM que ser fechado/removido dentro de destroy().
   Vazamento de recurso ao remover um widget do canvas é considerado bug crítico.
6. Não modificar arquivos do Core Shell (WidgetFrame, Sidebar, canvas engine,
   Storage Layer) para resolver um problema específico de um widget. Se um widget
   parece precisar disso, PARAR e reportar ao usuário antes de prosseguir — pode
   indicar uma lacuna real no SDK Contract que precisa de decisão consciente, não
   um ajuste isolado.
7. Qualquer timer que precise de precisão (ex: Pomodoro) deve rodar em Web Worker,
   nunca em setInterval direto na thread principal.

O QUE FAZER QUANDO HOUVER DÚVIDA
- Se a tarefa pedida conflitar com alguma regra acima, ou exigir uma decisão de
  arquitetura não coberta aqui (ex: "múltiplas instâncias do mesmo widget são
  permitidas?"), NÃO decidir sozinho. Parar e perguntar ao usuário.
- Preferir a solução mais simples que atenda ao critério de aceite do widget,
  não a mais "genérica" ou "escalável" — este é um app pessoal, não uma plataforma
  multiusuário nesta fase.

ANTES DE MARCAR QUALQUER TAREFA COMO CONCLUÍDA
- Rodar mentalmente o checklist de promoção para "stable" listado na especificação
  do widget correspondente e apontar explicitamente quais itens foram validados
  e quais ainda precisam de teste manual do usuário.
```

**Recomendação de uso:** cole esse bloco como mensagem de sistema (ou primeira mensagem) para a IA local antes de pedir a implementação de um widget específico, e cole também a seção correspondente deste documento (ex: só a seção "2. Timer Pomodoro") para não sobrecarregar o contexto dela com os 4 widgets de uma vez.
