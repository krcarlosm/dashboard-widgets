# Dashboard Modular de Widgets Locais


O **Dashboard Modular de Widgets** é uma plataforma de produtividade pessoal desenvolvida em **React + TypeScript + Vite** no frontend e **Python (FastAPI + WebSockets)** no agente backend. 

O projeto consiste em um dashboard customizável, onde o usuário pode adicionar widgets/aplicativos arrastáveis, redimensionáveis e personalizáveis. A proposta é criar um ambiente simples e útil para organização diária, com foco em execução local, privacidade e integração com um agente de apoio em Python.

<img width="2000" height="1071" alt="image" src="https://github.com/user-attachments/assets/9e15cdb1-fed0-4cee-83e9-6013cfb3deff" />

---

## 🚀 Visão Geral e Recursos Principais


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

O menu de perfil agora oferece duas opções de exportação:

- **Somente Canvas**: salva o perfil, layout, aparência e configurações dos widgets.
- **Canvas + Anotações**: inclui também todos os registros do IndexedDB, incluindo registros antigos que ficaram órfãos após a recriação de uma instância.

Quando o Agente Local está ativo, o arquivo é gravado automaticamente em:

```text
C:\Users\<usuário>\Documents\Dashboard Backups
```

Os arquivos usam o nome `dashboard-backup-AAAA-MM-DD_HH-MM-SS.json`. O botão **Abrir pasta de backups** abre esse diretório no Explorer. Se o agente não estiver disponível, a exportação usa o download do navegador como fallback.

A importação valida o formato e solicita confirmação antes de substituir o canvas. Backups completos também restauram os dados do IndexedDB. Recomenda-se gerar um backup completo antes de resetar, remover ou recriar widgets.

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
