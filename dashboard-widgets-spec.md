# Especificação Técnica — Dashboard Modular de Widgets Locais

## Sumário Executivo

O produto é um **canvas pessoal em branco**, com uma barra lateral de widgets arrastáveis e redimensionáveis, rodando localmente. Antes de detalhar as 6 perguntas, é importante registrar uma decisão de arquitetura que impacta tudo abaixo:

> **Nem todos os widgets pedidos são 100% viáveis como "aplicação pura de navegador".**
> `Top 10 arquivos editados` e `Baú de lembranças` (screenshots + clipboard contínuo) exigem acesso ao sistema de arquivos e a eventos do SO que o sandbox de um navegador comum **não permite monitorar em background** por questões de segurança (a Clipboard API exige foco/permissão a cada leitura; a Screen Capture API exige interação explícita do usuário a cada captura; a File System Access API não faz *watch* contínuo sem reconfirmação).

Por isso, recomendo uma arquitetura **híbrida**:

- **Camada Web (UI)**: React rodando como PWA, é o que o usuário vê e interage — canvas, widgets, configurações.
- **Camada Local (Agente)**: um processo local leve (Tauri/Rust ou um pequeno serviço Python/Node, já que o usuário tem familiaridade com Python) que roda em background, monitora clipboard, indexa arquivos editados recentemente e tira screenshots periódicos, expondo tudo via WebSocket/HTTP em `localhost`.

Essa divisão é o que torna os dois widgets mais "ambiciosos" tecnicamente viáveis sem violar os limites de segurança do navegador. Tudo isso está detalhado nas seções abaixo.

---

## 1. Divisão do Projeto

| Módulo | Responsabilidade |
|---|---|
| **Core Shell (Canvas Engine)** | Grid de arrasta-e-solta, redimensionamento, persistência de layout, ciclo de vida dos widgets (montar/desmontar) |
| **Widget SDK / Contrato** | Interface padrão que todo widget deve implementar (`init`, `render`, `getConfig`, `onResize`, `destroy`) — isso é o que torna os widgets "independentes entre si" |
| **Widget Registry / Marketplace** | Catálogo de widgets disponíveis, versão instalada vs. disponível, metadados (ícone, descrição, tamanho mínimo/máximo) |
| **Storage Layer** | Abstração sobre IndexedDB (dados estruturados) e OPFS/File System Access (arquivos grandes como screenshots) |
| **Local Agent (opcional, para widgets sensíveis)** | Processo nativo local que monitora clipboard, arquivos do sistema e captura de tela |
| **Perfil & Sync** | Exportação/importação de configuração, versionamento de schema, migração entre máquinas |
| **Widgets individuais** | Cada um é um pacote isolado, sem dependência cruzada entre eles |

**Princípio arquitetural chave:** cada widget é um **micro-frontend isolado** (pense em cada widget como um plugin com seu próprio estado, storage namespace e ciclo de vida). O Core Shell nunca conhece a lógica interna de um widget — apenas o contrato do SDK.

---

## 2. Ferramentas e Por Quê

| Camada | Ferramenta | Justificativa |
|---|---|---|
| Framework UI | **React + TypeScript** | Ecossistema maduro, tipagem forte reduz bugs em um sistema de plugins |
| Grid/Drag-resize | **react-grid-layout** ou **dnd-kit + resizable-panels** | react-grid-layout já resolve colisão, redimensionamento e serialização de layout em JSON — economiza semanas de trabalho |
| Estado global | **Zustand** | Mais leve que Redux, ótimo para estado por widget sem boilerplate |
| Persistência estruturada | **IndexedDB** (via `idb` ou `Dexie.js`) | Suporta grandes volumes, transações, e é nativo do navegador (sem backend) |
| Persistência de arquivos grandes | **OPFS (Origin Private File System)** ou **File System Access API** | Necessário para screenshots do Baú de Lembranças sem estourar limites do IndexedDB |
| Áudio | **Web Audio API** | Geração de ruído branco/marrom via síntese (não precisa de arquivos de áudio grandes) |
| Empacotamento nativo (opcional) | **Tauri** | Mais leve que Electron, escrito em Rust, e permite ao "Local Agent" acessar clipboard/filesystem/screenshot de forma contínua e segura, mantendo o frontend em React |
| Local Agent (se não usar Tauri) | **Python (FastAPI) + watchdog** | Aproveita a familiaridade do usuário com Python; `watchdog` monitora alterações de arquivos, `pyperclip`/`pygetwindow` monitoram clipboard |
| Empacotamento do perfil | **JSON versionado + Zip** | Formato legível, fácil de migrar, fácil de dar diff |

---

## 3. Ordem de Complexidade (do mais simples ao mais complexo)

1. **Quadro de anotações rápidas**
   Apenas um `<textarea>` com autosave em IndexedDB. Zero dependências externas.

2. **Timer Pomodoro**
   Máquina de estados simples (idle → foco → pausa → foco…), `setInterval`/`Web Worker` para não travar com a aba em background, `Notification API` para alertas.

3. **To-do list do dia/semana**
   CRUD simples + agrupamento por data. Complexidade extra: lógica de "virada de dia" (o que acontece à meia-noite com tarefas não concluídas) e views diária/semanal.

4. **Gerador de white/brown noise**
   Web Audio API com `AudioBufferSourceNode` + filtro para diferenciar white/brown/pink noise. Não é complexo tecnicamente, mas exige atenção a performance (loop sem cliques/gaps de áudio) e ao ciclo de vida do `AudioContext` quando o widget é destruído.

5. **Top 10 arquivos editados no dia/semana**
   Exige indexação de metadados do sistema de arquivos (data de modificação) e persistência de um índice histórico (já que o SO não guarda "top 10 editados", só "última modificação"). Aqui entra a necessidade do Local Agent — o navegador sozinho, mesmo com File System Access API, só enxerga pastas que o usuário explicitamente autorizou, e não faz watch automático sem repetição de permissão.

6. **Baú de lembranças (screenshots + clipboard, retenção de até 7 dias)**
   O mais complexo por acumular vários problemas ao mesmo tempo:
   - Captura periódica de tela (exige permissão contínua ou Local Agent)
   - Monitoramento de clipboard (mesma limitação de permissão)
   - Política de retenção automática (expurgo diário de itens > 7 dias)
   - Gestão de espaço em disco (screenshots são pesados — precisa de compressão, thumbnails, e possivelmente um limite de tamanho total com política de descarte)
   - Superfície de risco de privacidade maior do sistema inteiro (ver seção de segurança abaixo)

---

## 4. Outras Sugestões de Widgets para o Perfil deste Usuário

Considerando o contexto de trabalho (suporte técnico, engenharia de qualidade, treinamento de campo) e os projetos pessoais (Python, visão computacional, automações, criação de conteúdo técnico):

- **Snippet Manager**: cofre de trechos de código/comandos recorrentes (ex: comandos de diagnóstico, templates de FMEA, trechos de Python), com busca full-text.
- **Painel de builds/scripts**: atalhos para rodar scripts locais frequentes (ex: o orquestrador multi-agente, o conversor JSON→PPTX) com botão "run" e log de saída.
- **Conversor de unidades técnicas**: pressão (PSI/bar), temperatura, torque — útil no contexto de manifold de refrigeração e laudos técnicos.
- **Kanban de casos/chamados**: quadro simples para acompanhar casos de garantia/atendimento em andamento (Aberto → Em análise → Laudo emitido → Fechado).
- **Monitor de recursos do sistema**: CPU/GPU/RAM em tempo real — relevante para quem roda LLMs locais via LM Studio.
- **Biblioteca de templates de resposta técnica**: acesso rápido aos modelos de "parecer técnico" e "carta ao consumidor" já usados.
- **Widget de calendário/agenda com integração local**: próximos treinamentos de campo, prazos de laudos.
- **Launcher de aplicações/pastas**: atalhos para pastas de projeto frequentes (Zorin OS vs Windows desktop).
- **Leitor de RSS/changelog**: acompanhar releases de bibliotecas usadas (python-pptx, Manim, LM Studio).

---

## 5. Administração do Perfil na Migração entre Computadores

Estratégia em camadas, separando **configuração** de **dados pesados**:

### 5.1 O que é exportável (leve, sempre portável)
- Layout do canvas (posições, tamanhos, grid) → JSON
- Configurações de cada widget (ex: duração do Pomodoro, tags do to-do) → JSON por widget, namespaced (`widget:pomodoro:config`, `widget:todo:config`…)
- Lista de widgets instalados e suas versões

### 5.2 O que é opcionalmente exportável (pesado, decisão do usuário)
- Conteúdo do to-do list e das anotações → pode ir junto por padrão (são leves)
- Conteúdo do Baú de Lembranças → **não** deveria ir por padrão (screenshots pesados + dados potencialmente sensíveis). Melhor oferecer como export separado, opt-in.

### 5.3 Formato do arquivo de perfil

```
meu-perfil.dashboardpack (zip)
├── manifest.json          # versão do schema, data de export, versão dos widgets
├── layout.json            # grid layout
├── widgets/
│   ├── pomodoro.json
│   ├── todo.json
│   ├── notes.json
│   └── noise.json
└── baú/ (opcional, só se o usuário marcar "incluir dados sensíveis")
    └── ...
```

### 5.4 Mecanismo de transporte
- **Manual**: botão "Exportar perfil" → baixa o `.dashboardpack`; no novo computador, "Importar perfil" → restaura tudo.
- **Sync automático (opcional, avançado)**: se o usuário já usa uma pasta sincronizada (Dropbox/Drive/Syncthing), o app pode salvar o `.dashboardpack` automaticamente nessa pasta via File System Access API, e o novo computador detecta e oferece "importar perfil encontrado".
- **Versionamento de schema**: todo `manifest.json` carrega uma versão (`schemaVersion: 3`). Ao importar em uma versão mais nova do app, roda-se um migrador incremental (`v1→v2→v3`) em vez de depender de compatibilidade direta.

---

## 6. Compartilhamento entre Usuários (Layouts/Templates Compartilháveis)

Sim, é totalmente viável — desde que se separe claramente **estrutura (template)** de **dado pessoal (instância)**.

### 6.1 Conceito: Template vs. Instância
- **Template**: define quais widgets, em quais posições/tamanhos, com configurações *padrão* (ex: "Pomodoro de 25 min", "3 colunas de to-do").
- **Instância**: é o template + os dados reais do usuário (suas tarefas, suas anotações, seu histórico).

Ao exportar um **Template compartilhável**, o sistema deve:
1. Copiar o layout e as configurações "de fábrica" de cada widget.
2. **Zerar** qualquer campo de dado pessoal (conteúdo de notas, tarefas, histórico do Baú).
3. Empacotar isso em um `.dashboardtemplate` (mesmo formato zip, mas sem a pasta de dados).

### 6.2 Formas de compartilhamento
- **Arquivo único**: `.dashboardtemplate` enviado por e-mail/chat, importável por qualquer usuário que tenha os mesmos widgets instalados (ou que o app baixe automaticamente do Registry).
- **Galeria/Marketplace compartilhado**: um repositório (pode começar como um repositório Git público de JSONs) onde usuários publicam e importam templates por URL — reaproveitando o mesmo Registry usado para descobrir novos widgets (pergunta 2 do usuário: "visualizar novos widgets disponíveis").
- **Resolução de dependências**: ao importar um template, o app verifica se todos os widgets referenciados existem no Registry local; se não, oferece instalar automaticamente antes de aplicar o layout.

### 6.3 Ponto de atenção
Como cada widget é isolado (SDK contract da seção 1), compartilhar um template nunca expõe dado de outro widget além do que ele mesmo declara como "configuração padrão exportável" — isso deve ser um campo explícito no contrato do SDK (`getExportableDefaults()` vs. `getUserData()`), para que um widget malicioso ou mal implementado não vaze dados pessoais acidentalmente num template público.

---

## Notas de Segurança e Privacidade (transversal a tudo acima)

- O **Baú de Lembranças** é, de longe, o widget de maior risco: acumula screenshots e clipboard, que podem conter senhas, dados de clientes, informações de garantia sensíveis. Recomenda-se:
  - Criptografia em repouso (mesmo local)
  - Expurgo automático estritamente cumprido em 7 dias (job diário de limpeza)
  - Nunca incluído em exports/templates compartilháveis por padrão
- O **Local Agent** (se adotado) deve rodar com escopo mínimo de permissões e nunca expor sua API além de `localhost`.
- Toda a persistência é **local-first**: não há necessidade de um backend na nuvem a menos que o usuário opte por sync automático — o que preserva a natureza "aplicação local" pedida originalmente.
