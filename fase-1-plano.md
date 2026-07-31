# Fase 1 — Core Shell + Sistema de Status de Widgets

> Pré-requisito já concluído (Fase 0): repositório, Widget SDK Contract inicial, widget "Hello World" com montagem, redimensionamento, reorganização e persistência validados.

## Objetivo da Fase

Consolidar o "sistema operacional" do dashboard antes de emplacar widgets com lógica de negócio real. Duas frentes novas entram nesta fase, além da continuidade do Core Shell:

1. **Sistema de Status de Widget** — todo widget carrega um status (`stable` | `in_development` | `needs_improvement` | `deprecated`) que controla visibilidade e interatividade.
2. **Segundo widget de teste** — para validar o Core Shell com *dois* widgets coexistindo (não só um "Hello World" isolado) e para servir de cobaia do sistema de status.

---

## 1. Extensão do Widget SDK Contract

O contrato definido na Fase 0 precisa ganhar um campo obrigatório de metadados. Isso é registrado **no manifesto do widget**, não no estado interno dele — ou seja, o Core Shell decide visibilidade/interatividade sem precisar instanciar o widget.

```ts
interface WidgetManifest {
  id: string;
  name: string;
  version: string;
  status: "stable" | "in_development" | "needs_improvement" | "deprecated";
  minSize: { w: number; h: number };
  maxSize?: { w: number; h: number };
  requiresAgent?: boolean; // já previsto para fases futuras
}
```

**Decisão de design:** o `status` fica no manifesto (metadado estático, definido pelo desenvolvedor do widget), não numa configuração editável pelo usuário. Isso evita que o usuário "reative" acidentalmente um widget instável mudando uma flag.

---

## 2. Regras de Visibilidade e Interatividade

| Status | Aparece na Sidebar (Explorar/Meus) | Pode ser adicionado ao canvas | Já instalado no canvas | Interação habilitada |
|---|---|---|---|---|
| `stable` | Sim | Sim | Normal | Sim |
| `in_development` | Sim | Sim | Visível | **Não** |
| `needs_improvement` | Sim | Sim | Visível | **Não** |
| `deprecated` | **Não** | Não | **Removido automaticamente do canvas** | — |

### 2.1 Widgets inativos (`in_development` / `needs_improvement`)
- Renderizam normalmente no canvas (ocupam espaço, mostram o conteúdo do widget), mas:
  - Uma camada de overlay bloqueia `pointer-events` no conteúdo interno (o usuário vê, mas não clica em nada dentro do widget)
  - Opacidade reduzida (~50–60%) para reforçar visualmente o estado
  - Tooltip ao passar o mouse explicando o motivo (ex: *"Este widget está em desenvolvimento e ainda não pode ser usado"*)
- **O que continua funcionando normalmente:** mover, redimensionar e remover o widget do canvas — isso é "chrome" do Core Shell, não lógica interna do widget.

### 2.2 Widgets deprecated
- Somem da sidebar (não podem mais ser adicionados)
- Se o usuário já tinha uma instância no canvas de um widget que passou a `deprecated` (ex: após uma atualização do app):
  - A instância é removida automaticamente do canvas na próxima abertura
  - **Os dados armazenados pelo widget não são apagados** (ficam retidos na Storage Layer, isolados por `widgetId`, para o caso de o widget ser reativado numa versão futura ou para permitir exportação manual dos dados antes do descarte definitivo)
  - Uma notificação única (toast, não modal bloqueante) informa: *"O widget X foi descontinuado e removido do seu canvas"*

---

## 3. Indicador Visual de Status

Um badge pequeno no canto do frame do widget (mesmo padrão visual em todo o sistema, para consistência):

| Status | Cor | Ícone sugerido | Posição |
|---|---|---|---|
| `stable` | Verde | ✓ (check) — ou **nenhum badge**, já que é o estado "padrão esperado" | Canto superior direito do frame |
| `in_development` | Azul/cinza | 🔧 (chave de fenda) | Canto superior direito do frame |
| `needs_improvement` | Amarelo/laranja | ⚠ (alerta) | Canto superior direito do frame |
| `deprecated` | — | — | N/A (widget não é exibido) |

**Decisão de design:** considerar se `stable` deve ter badge ou não. Recomendo **omitir o badge para `stable`** — assim o usuário aprende rapidamente que "ausência de badge = tudo certo", e só presta atenção quando algo precisa de atenção. Isso reduz ruído visual na maioria dos widgets (que estarão `stable` na maior parte do tempo).

O mesmo badge aparece também na **Sidebar** (lista de widgets), para o usuário saber o status antes mesmo de arrastar o widget para o canvas.

---

## 4. Novo Widget de Teste: Contador de Cliques

O Hello World já validou o ciclo básico de vida (montar, redimensionar, mover, persistir). Ele é, porém, um widget **passivo** — não teve interação real do usuário nem escrita frequente na Storage Layer. O segundo widget de teste precisa cobrir essas lacunas.

### 4.1 Especificação funcional
- Um número grande centralizado (contador, inicia em 0)
- Um botão "+1" que incrementa o contador
- Um botão "Resetar" que zera o contador
- O valor é persistido a cada clique (sem debounce — diferente do autosave de texto, aqui queremos testar escrita imediata e frequente)

### 4.2 Por que esse widget é o teste certo para esta fase
- Testa **escrita ativa e frequente** na Storage Layer (diferente da escrita passiva/rara do Hello World)
- Testa **dois widgets simultâneos no canvas**, cada um com seu namespace de storage isolado — valida que não há vazamento de estado entre `widgetId`s
- Serve como **cobaia do sistema de status**: recomenda-se subir esse widget com status `in_development` propositalmente, para validar visualmente:
  - Badge azul aparecendo corretamente
  - Overlay bloqueando o clique no botão "+1"
  - Tooltip explicativo funcionando
  - Depois, mudar manualmente o manifesto para `stable` e confirmar que o widget "liga" (badge some, botão volta a funcionar) sem precisar remontar o app do zero

### 4.3 Critério de aceite do widget em si
- Contador incrementa e persiste corretamente com o app aberto
- Fechar e reabrir o navegador mantém o valor
- Com status `in_development`: botões visíveis mas não clicáveis, badge e tooltip corretos
- Com status `stable`: botões funcionam normalmente, sem badge

---

## 5. Tarefas Técnicas da Fase

1. Adicionar campo `status` ao `WidgetManifest` e ao schema de validação (se houver, ex: Zod)
2. Implementar componente `<WidgetStatusBadge status={...} />` reutilizável
3. Implementar `<WidgetFrame>` (o wrapper que o Core Shell coloca ao redor de todo widget) com:
   - Renderização condicional do badge
   - Overlay de bloqueio de interação quando status ∈ {`in_development`, `needs_improvement`}
   - Tooltip contextual
4. Implementar lógica de filtragem na Sidebar: ocultar `deprecated` da listagem
5. Implementar rotina de "sync de manifesto" ao carregar o app: verificar se algum widget do canvas atual tem status `deprecated` no manifesto mais recente → remover do canvas + disparar toast
6. Criar o widget "Contador de Cliques" seguindo o SDK Contract
7. Validar isolamento de namespace na Storage Layer com os dois widgets rodando ao mesmo tempo

---

## 6. Matriz de Casos de Teste

| Cenário | Resultado esperado |
|---|---|
| Widget `stable` no canvas | Sem badge, totalmente interativo |
| Widget `in_development` no canvas | Badge azul, conteúdo visível, cliques bloqueados, tooltip ao hover |
| Widget `needs_improvement` no canvas | Badge amarelo, conteúdo visível, cliques bloqueados, tooltip ao hover |
| Widget `deprecated` já presente no canvas, app recarregado | Widget desaparece do canvas, toast de aviso exibido uma única vez, dados preservados na Storage Layer |
| Widget `deprecated` na Sidebar | Não aparece nem em "Meus Widgets" nem em "Explorar" |
| Mover/redimensionar widget inativo (`in_development`/`needs_improvement`) | Funciona normalmente (chrome do Core Shell não é afetado pelo status) |
| Dois widgets diferentes no canvas escrevendo na Storage Layer simultaneamente | Nenhum dado cruzado entre `widgetId`s; ambos persistem corretamente |
| Mudança manual de status no manifesto (`in_development` → `stable`) sem reload completo | Widget destrava a interação assim que o manifesto é revalidado (definir se isso exige reload da página ou é reativo — ver observação abaixo) |

**Observação em aberto para decisão sua:** a mudança de status em tempo real (sem reload) exige que o Core Shell escute mudanças no manifesto continuamente (ex: revalidação a cada X segundos ou um evento de "manifesto atualizado"). Para esta fase, sugiro simplificar: **status é lido apenas no carregamento do app** (reload necessário para refletir mudança). Revisitar isso na Fase 6 (Registry), onde a atualização de widgets já será um fluxo tratado de forma mais robusta.

---

## Critério de Aceite da Fase 1 (visão geral)

- Dois widgets (Hello World + Contador de Cliques) coexistem no canvas sem interferência de storage
- Sistema de status funcional nos 4 estados, com indicador visual consistente entre Sidebar e Canvas
- Widgets `deprecated` nunca aparecem na Sidebar e são removidos automaticamente de canvas existentes
- Widgets `in_development`/`needs_improvement` são visíveis mas comprovadamente inativos (não é possível interagir com o conteúdo interno)
