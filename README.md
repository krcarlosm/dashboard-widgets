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
O servidor do agente estará ativo em `ws://localhost:8000/ws`.

Como explicado anteriormente, o Agente Python serve apenas para que os widgets que dependam de recursos do sistema operacional, possam realizar sua função. Como por exemplo, o `Bau de Lembranças`, que atua como uma **área de transferência** (Win + V, do windows) e precisa ter acesso ao conteúdo que você copiou recentemente. O aplicativo ainda está em desenvolvimento, mas já é capaz de armazenar o conteúdo em um diretório específico `C:\Users\.dashboard-agent`

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
