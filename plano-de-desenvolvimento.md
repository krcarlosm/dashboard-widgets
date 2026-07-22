# Plano de Desenvolvimento — Dashboard Modular de Widgets Locais

## Ajustes de Escopo Incorporados

Antes do plano, dois pontos do escopo original foram corrigidos com base no seu direcionamento:

1. **Local Agent em Python** (não Node.js/Tauri-Rust), aproveitando sua familiaridade com a linguagem. Isso muda a stack recomendada na camada nativa: **FastAPI + WebSocket** rodando localmente, empacotado depois com **PyInstaller** para não depender de um Python instalado na máquina do usuário final.

2. **Baú de Lembranças — comportamento revisado:**
   - **Screenshots**: só são capturados **quando o usuário aciona explicitamente** (botão no widget ou atalho de teclado global registrado pelo Agent). Não há captura periódica nem em segundo plano.
   - **Clipboard**: o Agent monitora continuamente a área de transferência, mas com **separação por tipo de conteúdo**:
     - Se o clipboard contém **imagem** → salva no repositório de imagens do Baú.
     - Se o clipboard contém **texto** → salva no repositório de texto do Baú.
   - Ambos ainda respeitam a retenção máxima de 7 dias com expurgo automático diário.

Essa mudança **reduz a superfície de risco de privacidade** (sem captura de tela invisível) mas mantém a complexidade de engenharia no monitoramento de clipboard multiplataforma (Zorin OS/Linux + Windows), detalhado na Fase 3.

---

## Visão Geral das Fases

| Fase | Nome | Entrega Principal |
|---|---|---|
| 0 | Fundação | Repositório, contratos, decisões de stack |
| 1 | Core Shell | Canvas, grid, Widget SDK, Storage Layer |
| 2 | Widgets MVP (sem Agent) | Notas, Pomodoro, To-do, Gerador de ruído |
| 3 | Local Agent (Python) | Serviço de clipboard + ponte de comunicação |
| 4 | Widgets dependentes do Agent | Baú de Lembranças, Top 10 arquivos editados |
| 5 | Perfil & Migração | Export/import, versionamento de schema |
| 6 | Registry / Descoberta de Widgets | Catálogo "novos widgets disponíveis" |
| 7 | Templates Compartilháveis | Export de layout sem dado pessoal |
| 8 | Backlog Aprovado | Fila priorizada dos widgets extras aprovados |

---

## Fase 0 — Fundação

**Objetivo:** travar as decisões estruturais antes de escrever widgets, para não retrabalhar depois.

**Tarefas:**
- Criar monorepo (`/app` para o frontend React, `/agent` para o serviço Python)
- Definir o **Widget SDK Contract** (interface TypeScript): `init()`, `render()`, `getConfig()`, `getExportableDefaults()`, `getUserData()`, `onResize()`, `destroy()`
- Definir schema-base do `manifest.json` de perfil (`schemaVersion`, `widgets[]`, `createdAt`)
- Escolher e configurar: React + TypeScript, Zustand, react-grid-layout, Dexie.js (IndexedDB)
- Definir protocolo de comunicação Frontend ↔ Agent (WebSocket local, ex: `ws://127.0.0.1:8765`)

**Critério de aceite:** um "widget de exemplo" (hello world) consegue ser montado no canvas, arrastado, redimensionado e persistido após reload da página.

**Risco principal:** subestimar o contrato do SDK e ter que quebrar compatibilidade cedo. Mitigação: validar o contrato construindo 2 widgets bem diferentes (Notas e Pomodoro) antes de fechar a interface.

---

## Fase 1 — Core Shell

**Objetivo:** o "sistema operacional" do dashboard, sem nenhuma lógica de negócio de widget.

**Entregáveis:**
- Canvas com grid livre (drag, resize, snap)
- Sidebar com lista de widgets instalados
- Storage Layer abstrata: `storage.get(widgetId, key)`, `storage.set(widgetId, key, value)` — namespaced por widget, para reforçar isolamento
- Persistência automática do layout a cada mudança (debounce de ~500ms)
- Tela de "Meu Perfil" (placeholder, populada de verdade na Fase 5)

**Critério de aceite:** fechar e reabrir o navegador mantém o canvas exatamente como estava.

---

## Fase 2 — Widgets MVP (sem dependência do Agent)

Ordem de implementação (do mais simples ao mais complexo, conforme já definido):

### 2.1 Quadro de Anotações Rápidas
- `<textarea>` com autosave (debounce) via Storage Layer
- Sem formatação rica na v1 (Markdown simples pode entrar no backlog)

### 2.2 Timer Pomodoro
- Máquina de estados: `idle → foco → pausa_curta → foco → ... → pausa_longa`
- Rodar o contador em **Web Worker** (evita drift quando a aba perde foco)
- `Notification API` para alerta sonoro/visual ao trocar de ciclo
- Configuráveis: duração de foco, pausa curta, pausa longa, ciclos até pausa longa

### 2.3 To-do List (dia/semana)
- CRUD de tarefas com data associada
- Toggle de visão: Hoje / Semana
- Lógica de virada de dia (job local que roda ao abrir o app, verifica tarefas do dia anterior não concluídas e pergunta: mover para hoje ou arquivar)

### 2.4 Gerador de White/Brown Noise
- `Web Audio API`: `AudioBufferSourceNode` + filtro passa-baixa para diferenciar white/brown/pink
- Loop perfeito sem cliques audíveis (buffer gerado proceduralmente, sem arquivo de áudio)
- Controle de volume e fade in/out ao pausar

**Critério de aceite da fase:** os 4 widgets funcionam de forma completamente independente do Local Agent — o app deve ser 100% utilizável mesmo sem o Agent instalado (com os outros 2 widgets simplesmente indisponíveis/ocultos).

---

## Fase 3 — Local Agent (Python)

**Objetivo:** subir o serviço local que dá suporte aos dois widgets restantes, respeitando o escopo revisado (sem screenshot automático).

### 3.1 Estrutura do serviço
- **FastAPI** expondo WebSocket em `127.0.0.1` (porta configurável, ex: `8765`)
- Handshake simples de autenticação local (token gerado na primeira execução, salvo em ambos os lados) para impedir que outra aplicação na máquina se conecte ao Agent
- Empacotamento via **PyInstaller** para gerar executável standalone (Linux `.AppImage`/binário, Windows `.exe`) — usuário não precisa ter Python instalado

### 3.2 Monitor de Clipboard (texto vs. imagem)
Esse é o item de maior complexidade multiplataforma da fase, já que o usuário trabalha em Zorin OS (Linux) e também tem um desktop Windows:

| Plataforma | Texto | Imagem |
|---|---|---|
| Linux (Zorin OS) | `pyperclip` ou polling via `Xlib` | Não há solução 100% nativa em Python puro; usar subprocess para `xclip -selection clipboard -t image/png -o` (X11) ou `wl-paste` (Wayland) |
| Windows | `pyperclip` | `win32clipboard` (via `pywin32`) para ler `CF_DIB`/`CF_BITMAP` |

- Polling do clipboard a cada ~500ms–1s (não há evento nativo cross-platform confiável sem libs mais pesadas)
- Ao detectar mudança:
  - Se é imagem → salvar em `~/.dashboard-agent/bau/imagens/{timestamp}.png`
  - Se é texto → salvar em `~/.dashboard-agent/bau/textos/{timestamp}.txt`
  - Emitir evento via WebSocket para o widget atualizar a lista em tempo real
- Deduplicação: não salvar se o conteúdo for idêntico ao último item salvo (evita spam quando o usuário seleciona o mesmo texto várias vezes)

### 3.3 Captura de tela sob demanda
- Endpoint HTTP local (`POST /screenshot`) acionado pelo botão do widget no frontend
- Usa `mss` (biblioteca Python multiplataforma para screenshot) — **nunca roda em loop, só responde a essa chamada explícita**
- Screenshot salvo em `~/.dashboard-agent/bau/imagens/` com prefixo diferenciando origem (`screenshot_{timestamp}.png` vs `clipboard_{timestamp}.png`)

### 3.4 Expurgo automático (retenção de 7 dias)
- Job agendado no próprio Agent (roda a cada inicialização + a cada 6h enquanto ativo) que apaga arquivos de `bau/` com mais de 7 dias
- Log local do que foi expurgado (auditoria simples)

### 3.5 Indexação de arquivos editados (para o widget Top 10, Fase 4)
- `watchdog` monitorando pastas que o usuário autorizar explicitamente (lista configurável, não o sistema de arquivos inteiro)
- Mantém um índice local (SQLite leve) de `caminho, última modificação, contagem de eventos no dia/semana`

**Critério de aceite:** com o Agent rodando, copiar uma imagem gera um arquivo em `bau/imagens/`; copiar um texto gera um arquivo em `bau/textos/`; nenhuma captura de tela ocorre sem clique explícito no widget; arquivos com mais de 7 dias somem sozinhos.

**Risco principal:** suporte a Wayland no Linux para leitura de clipboard de imagem é menos maduro que X11. Mitigação: detectar o compositor em uso e documentar como fallback manual (usuário cola em um campo do widget) caso `wl-paste` falhe.

---

## Fase 4 — Widgets Dependentes do Agent

### 4.1 Baú de Lembranças
- UI com abas ou filtro: **Imagens** (screenshots + imagens de clipboard, com thumbnail) / **Textos** (lista com preview)
- Botão "Capturar tela agora" → chama o Agent
- Feed em tempo real dos itens de clipboard via WebSocket
- Cada item mostra: origem (screenshot manual / clipboard), timestamp, e countdown até expurgo
- Ação manual de "excluir agora" e "excluir tudo"

### 4.2 Top 10 Arquivos Editados (dia/semana)
- UI: toggle Dia/Semana
- Lista ordenada por contagem de eventos de modificação, com link direto (`file://` ou abrir no explorador de arquivos via Agent)
- Configuração inicial: usuário escolhe quais pastas o Agent deve indexar (nunca acesso amplo por padrão)

**Critério de aceite:** ambos os widgets ficam claramente marcados como "requer Agent" na sidebar, com estado de erro amigável caso o Agent não esteja rodando (não deixar a UI travar).

---

## Fase 5 — Perfil & Migração entre Computadores

- Exportação do `manifest.json` + configs por widget em `.dashboardpack` (zip)
- Dados do Baú explicitamente **fora** do export por padrão (opt-in separado)
- Importação com migrador de schema (`v1→v2→...`)
- UI de "Exportar perfil" / "Importar perfil"

**Critério de aceite:** exportar em uma máquina, importar em outra, e o canvas volta idêntico (exceto Baú, que é opt-in).

---

## Fase 6 — Registry / Descoberta de Novos Widgets

- Tela "Explorar Widgets" na sidebar, separada dos "Meus Widgets"
- Fonte inicial: catálogo estático (JSON versionado no próprio repositório) — evolui depois para um endpoint remoto
- Cada entrada do catálogo: nome, ícone, descrição, tamanho mínimo/máximo, se requer Agent
- Botão "Instalar" adiciona à lista de widgets disponíveis na sidebar principal, sem precisar já colocar no canvas

**Critério de aceite:** usuário consegue ver quais widgets do backlog (Fase 8) ainda não instalou, direto na UI.

---

## Fase 7 — Templates Compartilháveis

- Export de **Template** (sem dado pessoal, usando `getExportableDefaults()` do SDK) em `.dashboardtemplate`
- Import de template de terceiros com resolução de dependência (instala automaticamente widgets faltantes via Registry)

**Critério de aceite:** dois usuários com o mesmo template compartilhado veem o mesmo layout, cada um com seus próprios dados.

---

## Fase 8 — Backlog Aprovado (fila de desenvolvimento)

Todas as sugestões foram aprovadas. Ordem sugerida de prioridade (por valor imediato x esforço):

| Prioridade | Widget | Depende de Agent? |
|---|---|---|
| Alta | Snippet Manager | Não |
| Alta | Kanban de casos/chamados | Não |
| Alta | Conversor de unidades técnicas | Não |
| Média | Painel de builds/scripts (rodar scripts locais) | **Sim** (Agent precisa executar processos) |
| Média | Launcher de aplicações/pastas | **Sim** |
| Média | Biblioteca de templates de resposta técnica | Não |
| Baixa | Calendário/agenda com integração local | Depende do escopo (local-only vs. integração externa) |
| Baixa | Monitor de recursos do sistema (CPU/GPU/RAM) | **Sim** (Agent precisa ler métricas do SO, ex: via `psutil`) |
| Baixa | Leitor de RSS/changelog | Não |

> Observação técnica: "Painel de builds/scripts" e "Launcher" ampliam o escopo do Agent para **execução de processos locais**, o que exige uma camada extra de confirmação/segurança (o usuário deve aprovar explicitamente quais scripts/pastas o Agent pode executar/abrir) — recomenda-se tratar isso com o mesmo rigor do Baú de Lembranças.

---

## Resumo de Marcos (Milestones)

1. **M1 — App utilizável sem Agent**: fim da Fase 2 (Shell + 4 widgets independentes)
2. **M2 — Agent funcional**: fim da Fase 3 (clipboard e screenshot sob demanda operando)
3. **M3 — Feature-complete original**: fim da Fase 4 (todos os 6 widgets pedidos originalmente)
4. **M4 — Portabilidade**: fim da Fase 5 (migração entre computadores resolvida)
5. **M5 — Ecossistema**: fim das Fases 6 e 7 (descoberta e compartilhamento de templates)
6. **M6 — Expansão**: Fase 8, contínua, conforme capacidade
