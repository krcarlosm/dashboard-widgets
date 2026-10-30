# Dashboard Modular de Widgets Locais


O **Dashboard Modular de Widgets** é uma plataforma de produtividade pessoal desenvolvida em **React + TypeScript + Vite** no frontend e **Python (FastAPI + WebSockets)** no agente backend. 

O projeto consiste em um dashboard customizável, onde o usuário pode adicionar widgets/aplicativos arrastáveis, redimensionáveis e personalizáveis. A proposta é criar um ambiente simples e útil para organização diária, com foco em execução local, privacidade e integração com um agente de apoio em Python.

<img width="2000" height="1071" alt="image" src="https://github.com/user-attachments/assets/9e15cdb1-fed0-4cee-83e9-6013cfb3deff" />

---

## 🚀 Visão Geral e Recursos Principais

- **Canvas Modular Responsivo:** Layout flexível com persistência local via `IndexedDB` e `localStorage`.
- **Coleção de Widgets Integrados:** Notas Rápidas, Pomodoro Multiferramenta, Lista de Tarefas, Gerador de Ruído, Snippets, Conversores de Unidades, Calculadora de Datas, Regra de Três, Memória Baú, Monitor de Arquivos Editados e muito mais.
- **Agente Local em Python:** Comunicação bidirecional via WebSocket para recursos do sistema operacional (captura de tela, área de transferência, indexação de arquivos, monitoramento). O Agente Python serve apenas para os widgets (aplicativos) que dependem de recursos do sistema operacional. Caso não queira usá-los, não precisa iniciá-lo.
- **Temas e Personalização:** Suporte a modo Claro/Escuro, densidade de grid (Confortável/Compacto) e cores de acento personalizadas por instância de widget - quando você usa múltiplas instâncias do widget `Lista de Tarefas`, por exemplo, você pode mudar a cor de cada lista, ou ainda, mudar o título da lista, para que assim você possa localizar facilmente lista de tarefas distintas.

## 💾 Onde as informações ficam armazenadas

O dashboard utiliza dois mecanismos de persistência no navegador. Nenhum desses dados é enviado para um servidor externo pelo frontend.

### Perfil e composição do canvas

O perfil do dashboard é salvo no `localStorage` do navegador, na chave `dashboard_profile_v1`. Esse registro contém o manifesto do canvas, incluindo:

- quais widgets estão ativos e a identificação de cada instância (`instanceId`);
- o tipo de cada widget (`widgetId`);
- a posição no grid (`x` e `y`), o tamanho (`w` e `h`) e o identificador usado pelo `react-grid-layout` (`i`);
- o estado de bloqueio, a cor individual e as configurações leves de cada instância;
- aparência global, como tema, densidade, cor de acento e plano de fundo do canvas;
- versão do schema e datas de criação e atualização do perfil.

Em resumo, o `localStorage` define a composição do canvas: quais blocos aparecem, onde ficam e qual é o seu tamanho. O grid possui 12 colunas; a altura é calculada conforme as linhas ocupadas pelos widgets.

### Conteúdo dos widgets

Os dados maiores ou específicos de cada widget são armazenados em um banco IndexedDB chamado `DashboardWidgetsDB`, usando a tabela `kvStore`. O armazenamento é isolado por instância: cada registro usa o formato `${instanceId}:${key}`. Assim, duas instâncias do mesmo widget não misturam seus conteúdos.

Atualmente, os principais dados ficam nestas chaves:

| Widget | Chaves armazenadas | Conteúdo |
| --- | --- | --- |
| Notas Rápidas | `content`, `updatedAt`, `mode` | Texto da anotação, horário da última gravação e modo de edição |
| Lista de Tarefas | `items`, `lastOpenedDate` | Tarefas, status, datas e controle da última abertura |
| Kanban | `kanban_items` | Cartões, texto, status da coluna e data de criação |
| Snippets | `snippets` | Título, conteúdo, linguagem, categoria, favoritos e data de criação |

O conteúdo desses widgets não fica dentro do manifesto do `localStorage`. Essa separação permite que o layout seja alterado sem regravar listas, notas ou históricos inteiros. Outros widgets que utilizam `context.storage` seguem o mesmo modelo de armazenamento isolado; widgets legados que usam `localStorage` diretamente podem ter uma chave própria documentada no respectivo código.

### Backup e recuperação

**Backup automático diário.** Com o agente ativo, o dashboard faz um backup completo (canvas + dados) todos os dias no horário configurado no menu de perfil (padrão **16:30**). Se o navegador ou o agente estiverem fechados nesse horário, o backup é feito assim que o dashboard voltar a ficar aberto com o agente conectado — inclusive no dia seguinte. O app verifica ao abrir, a cada minuto e quando o agente reconecta; com várias abas abertas, o agente garante um único backup por horário. Apenas os **10 backups automáticos** mais recentes são mantidos.

**Backup manual.** O menu de perfil oferece duas opções:

- **Somente Canvas**: salva o perfil, layout, aparência e configurações dos widgets.
- **Canvas + Anotações**: inclui também todos os registros do IndexedDB, incluindo registros antigos que ficaram órfãos após a recriação de uma instância.

Os arquivos ficam em:

| Sistema | Pasta |
|---|---|
| Windows | `C:\Users\<usuário>\Documents\Dashboard Backups` |
| Linux | `<pasta Documentos do XDG>/Dashboard Backups` (ou `~/Dashboard Backups`) |

A variável `DASHBOARD_BACKUP_DIR` substitui a pasta padrão. Nomes:

- `auto-dashboard-backup-AAAA-MM-DD_HH-MM-SS.json` — automáticos (rodízio de 10).
- `manual-dashboard-backup-AAAA-MM-DD_HH-MM-SS.json` — manuais, nunca apagados. Arquivos antigos sem prefixo também contam como manuais.

Se o agente não estiver disponível, o backup manual usa o download do navegador como fallback.

**Restauração.** A lista **Backups salvos** mostra os arquivos da pasta; **Restaurar** grava antes um backup manual do estado atual (ponto de segurança) e então substitui o canvas e os dados. **Importar arquivo** restaura um JSON de qualquer local. Ambos pedem confirmação.

**Início automático do agente (opcional).** A opção *Iniciar o agente junto com o sistema*, desligada por padrão, cria um atalho na pasta Inicializar do usuário (Windows, executado com `pythonw.exe` sem janela; log em `~/.dashboard-agent/agent.log`) ou um arquivo `~/.config/autostart/dashboard-agent.desktop` (Linux). Não usa Agendador de Tarefas nem privilégios de administrador; desmarcar remove o atalho.

---

## 📁 Estrutura do Projeto

```
.
├── app/                        # Aplicativo Frontend (React + TypeScript + Vite)
│   ├── src/
│   │   ├── components/         # Canvas, Sidebar, Header, Modais e Containers
│   │   ├── sdk/                # SDK de Desenvolvimento de Widgets e Comunicação AgentClient
│   │   ├── store/              # Zustand Store (Estado do Canvas e Perfil)
│   │   ├── types/              # Definições de Tipos Globais
│   │   └── widgets/            # Módulos de Widgets Individuais
│   ├── package.json
│   └── vite.config.ts
├── agent/                      # Agente Local Python (FastAPI + WebSockets)
│   ├── src/                    # Endpoints, Indexadores e Serviços SO
│   ├── requirements.txt
│   └── pyproject.toml
├── docs/
│   └── discussions/            # Histórico de planejamento, especificações e relatórios
└── README.md                   # Documentação consolidada do repositório
```

---

## 💻 Requisitos de Ambiente

- **Node.js**: `>= 18.x`
- **npm**: `>= 9.x`
- **Python**: `>= 3.10`
- **OS**: Windows 10/11 ou Linux

---

## ⚙️ Como Executar

### Início rápido

Depois da primeira instalação (passos 1 e 2 abaixo), um único script inicia o agente e o frontend:

```bash
# Windows (PowerShell)
./start-dashboard.ps1

# Linux
./start-dashboard.sh
```

O agente é iniciado em segundo plano somente se o ambiente `agent/.venv` existir. Sem ele, apenas o frontend é iniciado. Ao encerrar o frontend (`Ctrl+C`), o agente iniciado pelo script também é encerrado.

### 1. Iniciar o Frontend (`/app`)

Abra o diretório do projeto e abra o terminal. Execute os seguintes comandos:
```bash
cd app
npm install
npm run dev
```
Acesse a aplicação em `http://localhost:3000` (ou `http://localhost:5173`).

### 2. Iniciar o Agente Python (`/agent`)

Em um novo terminal, dentro do diretório do projeto, execute:
```bash
cd agent
python -m venv .venv

# No Windows (PowerShell):
.venv\Scripts\Activate.ps1

# No Linux/macOS:
source .venv/bin/activate

pip install -r requirements.txt
python -m src.main
```
O servidor do agente estará ativo em `ws://127.0.0.1:5137/ws` (HTTP em `http://127.0.0.1:5137`). Para recarregar o agente automaticamente ao editar o código, defina `DASHBOARD_AGENT_DEV=1` antes de iniciá-lo.

Como explicado anteriormente, o Agente Python serve apenas para que os widgets que dependam de recursos do sistema operacional, possam realizar sua função. Como por exemplo, o `Bau de Lembranças`, que atua como uma **área de transferência** (Win + V, do windows) e precisa ter acesso ao conteúdo que você copiou recentemente.

### Baú de Lembranças

- Textos e imagens copiados, além das capturas de tela, ficam em `~/.dashboard-agent/bau` (no Windows, `C:\Users\<usuário>\.dashboard-agent\bau`).
- Os itens são apagados automaticamente após **72 horas** da criação. O prazo pode ser alterado para 24 ou 48 horas nas configurações do widget.
- Conteúdo marcado como privado por gerenciadores de senha não é registrado.
- Clicar em um item o coloca de volta na área de transferência.
- No Linux, o Baú depende de `wl-clipboard` (Wayland) ou `xclip` (X11). A captura de tela no Wayland usa `grim`, `gnome-screenshot` ou `spectacle`.

### Top 10 Arquivos da Semana

- Lista os 10 arquivos mais acessados nos **últimos 7 dias**, somando aberturas e edições. As etiquetas **Aberto** e **Editado** indicam o que aconteceu com cada um, e os filtros mostram só um dos tipos.
- **Aberturas** vêm dos arquivos recentes do próprio sistema, lidos a cada 2 minutos: a pasta *Recent* no Windows e `~/.local/share/recently-used.xbel` no Linux.
- **Edições** são detectadas quando a data de modificação de um arquivo da lista muda. Para registrar também arquivos que você não abre pelo Explorer, adicione **pastas monitoradas** nas configurações do widget. Gravações seguidas em 5 minutos (salvamento automático) contam como uma edição.
- Clicar no nome abre o arquivo no aplicativo padrão; o ícone de pasta o mostra no Explorer/gerenciador de arquivos. O agente só abre arquivos do próprio histórico, e scripts/executáveis (`.exe`, `.ps1`, `.bat`…) são apenas mostrados na pasta.
- Ficam de fora temporários e arquivos de bloqueio (`~$*`, `*.tmp`, `.~lock*`), pastas, pastas ocultas e de ferramentas (`.git`, `node_modules`, `*.egg-info`) e os arquivos do próprio agente (Baú e backups).
- O histórico fica em `~/.dashboard-agent/file_activity.db` e é mantido por 30 dias. O arquivo antigo `edits_index.db` não é mais usado e pode ser apagado.

### Segurança do agente

O agente aceita conexões apenas de `127.0.0.1` e das origens do dashboard (`ALLOWED_ORIGINS`). Todo comando via WebSocket e toda rota HTTP de dados exigem o token local salvo em `~/.dashboard-agent/auth.token`; sem o handshake, nenhuma informação da área de transferência é enviada ao cliente.

Para usar o agente sem monitorar a área de transferência (o Baú continua recebendo capturas de tela), inicie-o com `DASHBOARD_AGENT_CLIPBOARD=0`.

---

## 🧪 Testes

Nenhum teste lê ou altera a área de transferência real, a pasta Inicializar ou os dados do dia a dia: o agente de teste usa pastas temporárias e portas próprias.

| Suíte | Comando | O que cobre |
|---|---|---|
| Agente (pytest) | `cd agent` → `pip install -r requirements-dev.txt` → `python -m pytest` | Segurança (token, origem, WebSocket), Baú, backups, autostart, Top 10 (Windows e Linux) |
| App (Vitest + Testing Library) | `cd app` → `npm test` | Cada widget, store do dashboard, storage, backup e restauração |
| E2E (Playwright) | `cd app` → `npx playwright install firefox` (uma vez) → `npm run test:e2e` | Fluxos principais no motor Firefox, com agente isolado |

Em máquinas que bloqueiam os navegadores não assinados do Playwright (comum em notebooks corporativos), rode o E2E no Microsoft Edge instalado: `npm run test:e2e:edge`. O roteiro visual opcional `EXPLORE=1 npx playwright test explore` gera capturas de todos os widgets em `app/test-results/explore/`.

---

## 📜 Contrato de Componentes e Guia para Novos Widgets

Se você deseja criar um novo widget para a plataforma, deve seguir estritamente as regras e o contrato definido em `app/src/sdk/types.ts`.

### 1. Estrutura do Contrato (`WidgetDefinition`)

Cada widget precisa exportar um objeto do tipo `WidgetDefinition<TConfig>`, composto por:
1. **`manifest`**: Metadados, dimensões no grid e ícone.
2. **`component`**: Componente React funcional recebendo `props.context`.
3. **`lifecycle`** *(opcional)*: Métodos de ciclo de vida (`init`, `destroy`, `onResize`).

```typescript
import React from 'react';
import { WidgetDefinition, WidgetComponentProps } from '../../sdk/types';
import { Sparkles } from 'lucide-react';

// 1. Definição do Tipo de Configuração
interface MeuWidgetConfig {
  tituloCustomizado: string;
}

// 2. Componente React
const MeuWidgetComponent: React.FC<WidgetComponentProps<MeuWidgetConfig>> = ({ context }) => {
  const { config, updateConfig, storage, agentClient } = context;

  return (
    <div className="p-3 flex flex-col gap-2 h-full">
      <h3 className="font-semibold">{config.tituloCustomizado || 'Meu Widget'}</h3>
      <button 
        onClick={() => updateConfig({ tituloCustomizado: 'Novo Título' })}
        className="px-2 py-1 bg-sky-500 text-white rounded hover:bg-sky-600"
      >
        Alterar Configuração
      </button>
    </div>
  );
};

// 3. Exportação do Widget cumprindo o Contrato
export const meuWidget: WidgetDefinition<MeuWidgetConfig> = {
  manifest: {
    id: 'meu-widget',
    name: 'Meu Novo Widget',
    version: '1.0.0',
    description: 'Descrição sucinta do que o widget faz.',
    icon: 'Sparkles', // Nome do ícone da biblioteca Lucide React
    defaultSize: { w: 4, h: 4 }, // Tamanho padrão (colunas x linhas do grid)
    minSize: { w: 2, h: 2 },
    maxSize: { w: 12, h: 8 },
    requiresAgent: false, // Define se precisa do agente Python rodando
  },
  component: MeuWidgetComponent,
};
```

---

### 2. Regras e Boas Práticas para Desenvolvedores

1. **Uso Obrigatório de `WidgetContext`**:
   - **`context.config` / `context.updateConfig`**: Utilize para estados de configuração leves mantidos no perfil.
   - **`context.storage`**: Utilize o armazenamento assíncrono isolado (`storage.get`, `storage.set`) para persitência de dados volumosos (listas, notas, histórico do widget).
   - **`context.agentClient`**: Utilize para inscrever-se (`agentClient.subscribe(event, callback)`) ou enviar comandos (`agentClient.send(...)`) ao agente Python.
2. **Dimensionamento e Layout Responsivo**:
   - Respeite os limites configurados em `minSize` e `maxSize`.
   - O widget deve ocupar `100%` da altura e largura do container fornecido (`h-full w-full overflow-auto`).
3. **Estilização e Variáveis de Tema**:
   - Não utilize cores hardcoded estáticas para superfícies de texto e fundo.
   - Utilize as variáveis CSS globais do app:
     - `var(--app-surface)`: Cor da superfície principal.
     - `var(--app-border)`: Cor das bordas.
     - `var(--app-text)`: Cor primária dos textos (garante contraste claro/escuro).
     - `var(--app-muted)`: Cor secundária/esmaecida para subtextos.
     - `var(--app-accent)`: Cor de destaque configurada.
4. **Registro do Widget no Dashboard**:
   - Para registrar seu widget, importe-o em `app/src/App.tsx` e chame `registerWidget(meuWidget)`.

---

## 📸 Prints do Projeto

### Listas de tarefas com título personalizáveis.
<img width="814" height="474" alt="image" src="https://github.com/user-attachments/assets/786cac30-271f-47f6-ba12-394cdaa63b94" />


### Menu Colapsável
Menu com barra lateral colapsável em 3 estágios:
- Expandido
- Compacto
- Oculto

<img width="116" height="652" alt="image" src="https://github.com/user-attachments/assets/dfaf08a7-4f20-461e-ac24-8deefe2dc923" />



### Menu Perfil
Menu de perfil, onde possibilita escolher entre:
- Modo Claro/Escuro
- Espaçamento Confortável/Compacto
- Cores de acento: 6 opções
- Portabilidade do perfil: exportar/importar (ainda em desenvolvimento)

<img width="496" height="682" alt="image" src="https://github.com/user-attachments/assets/a05c70ae-d99b-4fad-a1d1-cc4ff3d335ef" />


## 🛠️ Licença

Este projeto é disponibilizado sob a licença MIT.
