# Guia de Conversão para Extensão de Navegador (Chrome / Firefox)

Este documento fornece um guia técnico detalhado sobre como transformar o **Dashboard Modular de Widgets** em uma **Extensão de Navegador para Google Chrome e Mozilla Firefox**, detalhando pré-requisitos, infraestrutura necessária, adaptações de arquitetura e riscos específicos a corrigir.

---

## 1. Visão Geral da Arquitetura da Extensão (Manifest V3)

Para rodar nos navegadores modernos (Google Chrome, Microsoft Edge, Brave e Mozilla Firefox), o projeto deve ser empacotado seguindo a especificação **Manifest V3**.

O Dashboard React pode atuar no navegador de duas formas principais:
1. **Substituição de Nova Aba (`newtab override`):** Toda vez que o usuário abre uma nova aba no navegador, o Dashboard Modular é exibido instantaneamente.
2. **Popup de Ação / Aba Expandida:** Acessível via ícone na barra de ferramentas da extensão.

---

## 2. Pré-Requisitos Técnicos

### 2.1 Requisitos de Build Frontend (Vite + React)
- **Compilação Relativa (`base: './'`):** Ajustar o `vite.config.ts` para que os caminhos de scripts e estilos na pasta de saída `dist/` sejam relativos e não absolutos (ex: `./assets/index.js` em vez de `/assets/index.js`).
- **Remoção de Scripts Inline e Inline Styles Dinâmicos Proibidos:** O padrão Manifest V3 bloqueia o uso de `eval()` e injeção de scripts inline por regras rígidas de **CSP (Content Security Policy)**.
- **Ícones da Extensão:** Fornecer os ícones do aplicativo nos formatos `16x16`, `48x48` e `128x128` pixels PNG na pasta `public/icons/`.

### 2.2 Requisitos de Manifesto (`manifest.json`)
O arquivo `app/public/manifest.json` deve ser criado conforme a estrutura abaixo:

```json
{
  "manifest_version": 3,
  "name": "Dashboard Modular de Produtividade",
  "version": "1.0.0",
  "description": "Dashboard de widgets locais e produtividade pessoal",
  "chrome_url_overrides": {
    "newtab": "index.html"
  },
  "permissions": [
    "storage",
    "notifications",
    "nativeMessaging"
  ],
  "host_permissions": [
    "http://127.0.0.1/*",
    "http://localhost/*"
  ],
  "action": {
    "default_popup": "index.html",
    "default_title": "Abrir Dashboard"
  },
  "browser_specific_settings": {
    "gecko": {
      "id": "dashboard-produtividade@local",
      "strict_min_version": "109.0"
    }
  }
}
```

---

## 3. Infraestrutura Necessária e Métodos de Comunicação com o Agent Python

Em um ambiente de extensão de navegador, a comunicação com o sistema operacional e com o Agente Python possui duas abordagens principais:

### Opção A: Comunicação via WebSockets Locais (`ws://127.0.0.1:5137/ws`)
- **Funcionamento:** O agente Python continua rodando como um serviço local FastAPI/Uvicorn. A extensão faz requisições HTTP e abre WebSocket para `127.0.0.1`.
- **Pré-requisitos:** O `manifest.json` precisa de permissão explícita `host_permissions: ["http://127.0.0.1/*"]`.
- **Pontos de Atenção:**
  - O Chrome exige autorização para conexões de rede locais a partir do contexto de extensão.
  - O Agente Python deve adicionar a origem da extensão (`chrome-extension://<EXTENSION_ID>` ou `moz-extension://<EXTENSION_ID>`) nas origens autorizadas do CORS.

### Opção B (Recomendada para Segurança): Native Messaging API (`chrome.runtime.sendNativeMessage`)
- **Funcionamento:** O navegador gerencia diretamente o ciclo de vida do script Python. O navegador lança o agente como um processo filho e se comunica via `stdin` / `stdout` trocando mensagens JSON com prefixo de tamanho de byte.
- **Vantagens:**
  - **Não abre nenhuma porta de rede** (`127.0.0.1`), eliminando totalmente riscos de invasão por sites maliciosos externos.
  - Não exige servidores FastAPI ou Uvicorn rodando em background.
  - O navegador inicia o processo nativo automaticamente quando necessário.
- **Pré-requisitos de Infraestrutura:**
  - Instalar um arquivo manifesto de Host de Mensagens Nativas no sistema operacional do usuário:
    - **Windows:** Registro em `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.dashboard.agent` apontando para um arquivo `.json`.
    - **Linux:** Arquivo em `~/.config/google-chrome/NativeMessagingHosts/com.dashboard.agent.json`.

---

## 4. Riscos que Precisam Ser Corrigidos Antes da Conversão

### 4.1 Armazenamento: Migração / Suporte ao `chrome.storage.local`
- **Risco:** O `localStorage` e o `IndexedDB` em páginas de extensão podem ser limpos pelo navegador durante limpezas de cache ou atualizações da extensão.
- **Solução:** Adaptar a classe [`app/src/sdk/storage.ts`](file:///c:/Users/cmteixeira/OneDrive%20-%20PANASONIC%20DO%20BRASIL%20LIMITADA/CARLOS%20TEIXEIRA/08.%20PROJETOS/17.%20DASHBOARD%20PRODUTIVIDADE/app/src/sdk/storage.ts) para usar `chrome.storage.local` como mecanismo de fallback/persistência principal.

### 4.2 Restrições de CSP (Content Security Policy) em Manifest V3
- **Risco:** Injeção dinâmica de estilos ou carregamento de fontes/scripts externos via CDN é bloqueada.
- **Solução:** Todos os assets (fontes, ícones Lucide React, estilos Tailwind) devem ser empacotados localmente no bundle gerado pelo Vite.

### 4.3 Áudio em Segundo Plano (Widget Gerador de Ruído)
- **Risco:** Quando o dashboard roda em uma popup de extensão, fechar o popup destrói o contexto de áudio da Web Audio API.
- **Solução:** Caso o usuário deseje que o gerador de ruído continue tocando ao fechar o popup, o processamento de áudio deve ser movido para um **Offscreen Document** ou para a aba de Nova Aba mantida aberta.

---

## 5. Passo a Passo Técnico para Publicação / Instalação Local

1. **Compilação do Frontend:**
   ```bash
   cd app
   npm run build
   ```
2. **Carregar no Chrome / Edge:**
   - Acesse `chrome://extensions/`.
   - Ative o **Modo do desenvolvedor** (canto superior direito).
   - Clique em **Carregar sem compactação** (Load unpacked) e selecione a pasta `app/dist`.
3. **Carregar no Firefox:**
   - Acesse `about:debugging#/runtime/this-firefox`.
   - Clique em **Carregar extensão temporária** (Load Temporary Add-on) e selecione o arquivo `manifest.json` da pasta `dist`.
