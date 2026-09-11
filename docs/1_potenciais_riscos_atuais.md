# Potenciais Riscos Atuais do Projeto

Este documento apresenta uma avaliação técnica minuciosa dos **riscos atuais** identificados no Dashboard Modular de Widgets e seu Agente Local em Python.

---

## 1. Riscos de Segurança (Críticos)

### 1.1 Exposição Aberta do Token de Autenticação (`GET /`)
- **Vulnerabilidade:** No arquivo [`agent/src/main.py`](file:///c:/Users/cmteixeira/OneDrive%20-%20PANASONIC%20DO%20BRASIL%20LIMITADA/CARLOS%20TEIXEIRA/08.%20PROJETOS/17.%20DASHBOARD%20PRODUTIVIDADE/agent/src/main.py#L70-L77), o endpoint raiz `GET /` retorna o token secreto de autenticação do agente (`"token": TOKEN`) sem qualquer restrição.
- **Impacto:** Qualquer site malicioso ou script aberto no navegador do usuário pode fazer uma requisição simples `fetch("http://127.0.0.1:5137/")`, ler o token e autenticar no WebSocket local (`ws://127.0.0.1:5137/ws`).
- **Consequência:** Um atacante web pode solicitar capturas de tela sob demanda (`screenshot:request`) ou monitorar a área de transferência do usuário.
- **Mitigação Recomendada:**
  - Remover a propriedade `token` do endpoint publicamente acessível `GET /`.
  - Fazer o Agent salvar o token em um arquivo local restrito (`~/.dashboard-agent/token.secret` com permissões `0600`) ou lê-lo a partir de variáveis de ambiente.

### 1.2 Configuração de CORS Excessivamente Permissiva
- **Vulnerabilidade:** O middleware de CORS em [`agent/src/main.py`](file:///c:/Users/cmteixeira/OneDrive%20-%20PANASONIC%20DO%20BRASIL%20LIMITADA/CARLOS%20TEIXEIRA/08.%20PROJETOS/17.%20DASHBOARD%20PRODUTIVIDADE/agent/src/main.py#L58-L64) está configurado com `allow_origins=["*"]`.
- **Impacto:** Permite que requisições de qualquer origem de navegador façam chamadas HTTP para o servidor FastAPI local.
- **Mitigação Recomendada:** Restringir `allow_origins` apenas às URLs autorizadas (ex: `http://localhost:3000`, `http://localhost:5173` ou IDs de extensões de navegador específicas).

---

## 2. Riscos de Privacidade e Conformidade de Dados

### 2.1 Armazenamento Não Criptografado da Área de Transferência
- **Vulnerabilidade:** O serviço [`ClipboardMonitor`](file:///c:/Users/cmteixeira/OneDrive%20-%20PANASONIC%20DO%20BRASIL%20LIMITADA/CARLOS%20TEIXEIRA/08.%20PROJETOS/17.%20DASHBOARD%20PRODUTIVIDADE/agent/src/clipboard/monitor.py) monitora continuamente o clipboard do sistema operacional e salva novos textos/imagens em disco em texto claro (`~/.dashboard-agent/bau/textos/` e `bau/imagens/`).
- **Impacto:** Caso o usuário copie dados sensíveis (senhas, cartões de crédito, tokens JWT, documentos confidenciais), esses dados ficam gravados em disco sem criptografia por até 7 dias (período de retenção antes do expurgo automático pelo `PurgeService`).
- **Mitigação Recomendada:**
  - Oferecer um botão toggle visível no dashboard para pausar/retomar a captura do clipboard.
  - Implementar suporte a filtragem para ignorar conteúdos sinalizados por gerenciadores de senhas (ex: flags de clipboard sensitivo) ou aplicar criptografia AES local com chave de sessão.

---

## 3. Riscos de Arquitetura e Incompatibilidade de Porta (Bug de Comunicação)

### 3.1 Divergência de Porta entre Frontend SDK e Agent Python
- **Vulnerabilidade:** No SDK do frontend ([`app/src/sdk/agentClient.ts`](file:///c:/Users/cmteixeira/OneDrive%20-%20PANASONIC%20DO%20BRASIL%20LIMITADA/CARLOS%20TEIXEIRA/08.%20PROJETOS/17.%20DASHBOARD%20PRODUTIVIDADE/app/src/sdk/agentClient.ts#L6)), as URLs padrão estão definidas como `ws://127.0.0.1:8765/ws` e `http://127.0.0.1:8765/`. Porém, o backend Python ([`agent/src/main.py`](file:///c:/Users/cmteixeira/OneDrive%20-%20PANASONIC%20DO%20BRASIL%20LIMITADA/CARLOS%20TEIXEIRA/08.%20PROJETOS/17.%20DASHBOARD%20PRODUTIVIDADE/agent/src/main.py#L156)) é executado pelo Uvicorn na porta **`5137`**.
- **Impacto:** O frontend tenta se conectar à porta incorreta por padrão (`8765`), resultando em falhas contínuas de conexão WebSocket e estado de erro nos widgets dependentes do agente (`Baú de Lembranças` e `Arquivos Editados`).
- **Mitigação Recomendada:** Unificar a porta padrão em ambas as camadas (definindo `5137` ou `8765` de maneira consistente em constantes compartilhadas ou arquivo `.env`).

---

## 4. Riscos de Compatibilidade Multiplataforma (Linux / Wayland vs. Windows)

### 4.1 Captura de Clipboard em Segundo Plano sob Wayland (Linux)
- **Vulnerabilidade:** Ambientes Linux modernos baseados em Wayland (ex: Ubuntu 22.04+, Zorin OS 17+) impõem restrições rígidas de segurança que impedem processos em segundo plano sem foco de ler a área de transferência via `wl-paste` ou `xclip`.
- **Impacto:** O monitoramento de clipboard pode falhar silenciosamente ou gerar exceções contínuas no Agent ao rodar em distribuições Linux com Wayland ativado.
- **Mitigação Recomendada:** Detectar o tipo de servidor gráfico (X11 vs. Wayland) e fornecer um fallback elegante no widget onde o usuário pode colar manualmente caso o monitoramento de background seja bloqueado pelo SO.

---

## 5. Riscos de Persistência e Limites de Armazenamento no Navegador

### 5.1 Dependência Exclusiva do Storage Local do Navegador (IndexedDB/localStorage)
- **Vulnerabilidade:** A ordenação do canvas, perfis e dados de widgets locais (tarefas, notas, snippets) dependem do IndexedDB/localStorage do navegador via Dexie.js.
- **Impacto:** Se o usuário limpar o histórico/dados de navegação, abrir o dashboard em modo anônimo ou trocar de navegador, todas as configurações e dados locais são perdidos, pois não há sincronização nativa em arquivo de backup automático.
- **Mitigação Recomendada:** Implementar salvamento automático de backup local em arquivo JSON no diretório do usuário via Agent Python.
