# Dashboard Modular de Widgets Locais

Criação de um dashboard interativo com ferramentas de produtividade. O dashboard enxerga widgets disponíveis no repositório, e oferece para o usuário que escolherá instalá-los ou não. Cada widget possui atualização e ciclo de vida independentes.

Um canvas pessoal em branco com widgets arrastáveis, redimensionáveis e totalmente locais. Projetado para rodar no navegador e integrar-se com um agente local em Python para recursos nativos (clipboard, capturas de tela sob demanda e monitoramento).

## Estrutura do Projeto

- **`/app`**: Frontend React + TypeScript + Vite (Canvas, Grid Engine, Widget SDK, Storage).
- **`/agent`**: Serviço Local em Python (FastAPI + WebSocket local em `127.0.0.1:8765`).

## Requisitos de Ambiente

- Node.js >= 18
- Python >= 3.10
- Compatível com **Windows 11** e **Linux (Zorin OS)**

## Como Executar

### 1. Frontend (`/app`)
```bash
cd app
npm install
npm run dev
```
Acesse `http://localhost:5173`.

### 2. Local Agent (`/agent`)
```bash
cd agent
python -m venv .venv
# Linux: source .venv/bin/activate
# Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m src.main
```

## Documentação de Especificação
- [`dashboard-widgets-spec.md`](./dashboard-widgets-spec.md): Especificação técnica inicial.
- [`plano-de-desenvolvimento.md`](./plano-de-desenvolvimento.md): Plano de desenvolvimento por fases.
