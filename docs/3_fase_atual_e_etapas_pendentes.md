# Comparativo com os Planos, Fase Atual e Etapas Pendentes

Este documento realiza um mapeamento detalhado da situação atual do projeto em comparação com os dois documentos de referência:
- [`docs/discussions/plano-de-desenvolvimento.md`](file:///c:/Users/cmteixeira/OneDrive%20-%20PANASONIC%20DO%20BRASIL%20LIMITADA/CARLOS%20TEIXEIRA/08.%20PROJETOS/17.%20DASHBOARD%20PRODUTIVIDADE/docs/discussions/plano-de-desenvolvimento.md)
- [`docs/discussions/plano-operacional-execucao.md`](file:///c:/Users/cmteixeira/OneDrive%20-%20PANASONIC%20DO%20BRASIL%20LIMITADA/CARLOS%20TEIXEIRA/08.%20PROJETOS/17.%20DASHBOARD%20PRODUTIVIDADE/docs/discussions/plano-operacional-execucao.md)

---

## 📍 Resumo Executivo: Em Qual Fase Estamos?

O projeto está atualmente transicionando entre a **Fase 4 (Fim do Milestone M3 — Feature-Complete dos Widgets Originais)** e a **Fase 5 (Perfil & Migração / Expansão)**.

- **Concluído:** Todas as fundações do Canvas React, SDK de Widgets, armazenamento IndexedDB/Dexie, Temas de Cor/Densidade, Widgets MVP (Notas, Pomodoro, Todo, Ruído, Snippets, Kanban, Conversores) e o Agente Python (Clipboard, Screenshot sob demanda, Expurgo, Baú de Lembranças e Monitor de Arquivos Editados) foram desenvolvidos.
- **Pendente:** Exportação/Importação avançada de pacotes de perfil `.dashboardpack` (Fase 5), Catálogo Registry de Descoberta de Widgets (Fase 6), Templates Compartilháveis (Fase 7) e Widgets de Automação Avançada/Execução do Backlog (Fase 8).

---

## 📊 Status Detalhado por Fase do `plano-de-desenvolvimento.md`

| Fase | Nome | Status | Detalhes do Estado Atual |
|---|---|---|---|
| **Fase 0** | Fundação | 🟢 **100% Concluído** | Monorepo `/app` e `/agent` estruturado, Contrato SDK TypeScript definido, Dexie.js e WebSocket configurados. |
| **Fase 1** | Core Shell | 🟢 **100% Concluído** | Canvas responsivo com grid livre, reordenamento, sidebar de widgets, armazenamento isolado per-widget e temas centralizados. |
| **Fase 2** | Widgets MVP (sem Agent) | 🟢 **100% Concluído** | Anotações Rápidas, Pomodoro Multiferramenta (Worker/Web Audio), Todo List com edição, Ruído Branco/Marrom, Snippets, Conversores e Mini-Kanban implementados. |
| **Fase 3** | Local Agent (Python) | 🟡 **90% Concluído** | FastAPI + WebSockets operacionais, monitoramento de clipboard (texto/imagem), captura sob demanda e expurgo automático de 7 dias operacionais. *Restante: Ajuste final de porta e segurança do token.* |
| **Fase 4** | Widgets dependentes do Agent | 🟢 **100% Concluído** | Widget **Baú de Lembranças** (`memory-bau`) e Widget **Top Arquivos Editados** (`edited-files`) criados e integrados ao agentClient. |
| **Fase 5** | Perfil & Migração | 🟡 **30% Concluído** | Perfil local mantido no Zustand (`loadProfile`), mas a UI de exportação/importação de arquivos `.dashboardpack` com versionamento de schema ainda não está concluída. |
| **Fase 6** | Registry / Descoberta de Widgets | 🔴 **Pendente (0%)** | Aba "Explorar Widgets" na sidebar para navegação em catálogo de widgets disponíveis não iniciada. |
| **Fase 7** | Templates Compartilháveis | 🔴 **Pendente (0%)** | Export/import de `.dashboardtemplate` sem dados sensíveis não iniciado. |
| **Fase 8** | Backlog Aprovado | 🟡 **20% Concluído** | Snippets, Conversores e Kanban concluídos. Painel de scripts, Launcher de apps, Monitor de Sistema (CPU/RAM) e Downloader yt-dlp pendentes. |

---

## 📋 Comparativo com o Backlog de Tarefas do `plano-operacional-execucao.md`

### Tarefas P0 / P1 / P2 — Status de Execução
- **P0-01 a P0-04 (Fundação & Canvas):** 🟢 **Concluído** (Botões ajustados, reorganização do canvas e temas centralizados).
- **P1-01 a P1-05 (Melhorias de Widgets):** 🟢 **Concluído** (Edição de tarefas no To-do, categorias no Snippets, modos no Notes e segurança no Pomodoro).
- **P2-01 a P2-06 (Base do Agente Local):** 🟢 **Concluído** (Autenticação local no handshake, monitor de clipboard, captura sob demanda, expurgo e script PowerShell).
- **P3-01 (Mini-Kanban):** 🟢 **Concluído** (Widget de Kanban entregue).
- **P3-02 (Widgets de Automação/Monitoramento):** 🔴 **Pendente** (Monitor de SO, Music Player, Conversor de Mídia).

---

## 🚀 Próximas Etapas a Serem Concluídas (Roadmap Imediato)

1. **Correção de Porta e Token de Segurança do Agent:**
   - Padronizar porta `5137` ou `8765` no `agentClient.ts` e `main.py`.
   - Proteger o token de autenticação sem expô-lo no `GET /`.
2. **Implementação da Fase 5 (Export/Import de Perfil):**
   - Criar modal de "Exportar Perfil" (download de arquivo `.dashboardpack`) e "Importar Perfil".
3. **Implementação do Monitor de Sistema (CPU/RAM/Temp):**
   - Adicionar endpoint no Agent Python usando `psutil` e criar o widget correspondente.
4. **Construção do Catálogo de Widgets (Fase 6 Registry):**
   - Criar visualização de mercado/catálogo interno na Sidebar para instalar novos widgets sob demanda.
