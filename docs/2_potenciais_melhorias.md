# Potenciais Melhorias Identificadas no Projeto

Este documento detalha as oportunidades de melhoria técnica, experiência do usuário (UX) e expansão funcional para o Dashboard Modular de Widgets.

---

## 1. Arquitetura, Empacotamento e Execução (UX de Inicialização)

### 1.1 Executável Standalone Único (Baixa Prioridade)
- **Cenário Atual:** O usuário já utiliza dois scripts `.ps1` na área de trabalho para iniciar e finalizar o dashboard e o agente, o que atende bem à necessidade atual.
- **Melhoria Proposta:** Empacotar a aplicação frontend e o agente Python em um único aplicativo desktop (Tauri / PyInstaller) seria uma melhoria para distribuição futura, mas não é prioritário no momento.

### 1.2 Controle Interativo do Agente Python via Dashboard (Toggle ON/OFF)
- **Cenário Atual:** O agente Python inicia todos os serviços automaticamente ao ser lançado.
- **Melhoria Proposta:** Adicionar na Sidebar do Dashboard um botão para **Pausar o Agente**, próximo à mensagem de status, permitindo controle de privacidade sobre a captura do clipboard.

---

## 2. Segurança e Controle de Acesso ao Agente

### 2.1 Autenticação Segura por Arquivo Local de Token (`token.secret`)
- **Cenário Atual:** Resolvido (Token agora é gerenciado de forma segura e não exposto publicamente).

---

## 3. Evolução Funcional dos Widgets Existentes

### 3.1 Gerenciador de Snippets (`snippets`)
- **Realce de Sintaxe (Syntax Highlighting):** Adicionar destaque de código via Prism.js ou Highlight.js para linguagens populares.
- **Cópia Rápida em Um Clique:** Adicionar botão flutuante com feedback visual ("Copiado!").

### 3.2 Bloco de Notas Rápidas (`notes`)
- **Modos de Edição Ricos (Correção):** Os botões "Rich" e "Markdown" já existem na interface, mas precisam ter sua funcionalidade efetivamente implementada para alterar a renderização do texto aproveitando a estrutura atual.
- **Múltiplas Abas ou Notepads:** Permitir gerenciar múltiplas notas categorizadas no mesmo widget.

### 3.3 Mini-Kanban (`kanban`)
- **Tags de Prioridade e Datas Limite:** O widget já possui Drag-and-Drop nativo. A melhoria foca em permitir associar cores de prioridade (Baixa, Média, Alta) e datas aos cartões.

### 3.4 Timer Pomodoro (`pomodoro`)
- **Relatório e Histórico Diário:** Registrar contagem diária de sessões de foco concluídas para visualização estatística semanal.

---

## 4. Expansão de Widgets (Backlog Aprovado e Novas Ideias)

1. **Monitor de Recursos do SO (CPU / RAM / Temperatura):**
   - Ler métricas do sistema operacional via `psutil` no Agent Python e exibir gráficos responsivos no frontend.
2. **Music Player Minimalista:**
   - Integração com Web APIs de players locais ou serviços de streaming.
3. **Conversor e Downloader de Mídia (yt-dlp):**
   - Interface amigável no frontend que envia comandos para o Agent Python executar conversões de mídia ou downloads de vídeo via `yt-dlp`.
4. **Painel de Builds e Scripts Locais:**
   - Permitir cadastrar botões para executar scripts `.sh` / `.ps1` com visualização de saída no widget (com confirmação explícita do usuário).
