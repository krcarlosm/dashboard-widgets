# Dashboard Modular de Widgets Locais

Projeto experimental de produtividade com uma interface web local, baseado no Dashboard oferecido pelo KIMI.

A proposta aqui é compor um dashboard com widgets/aplicativos arrastáveis, redimensionáveis e personalizáveis. A proposta é criar um ambiente simples e útil para organização diária, com foco em execução local, privacidade e integração com um agente de apoio em Python.

## Avanços importantes até o momento

- Frontend em React + TypeScript + Vite com canvas modular e persistência de layout e preferências do usuário.
- Estrutura inicial de widgets com funcionalidades práticas para produtividade, incluindo notas rápidas, pomodoro, lista de tarefas, snippets, conversor de unidades, calculadora de datas, regra de três e recursos complementares.
- Agente local em Python com comunicação via WebSocket, autenticação local, monitoramento de clipboard, indexação de arquivos editados, captura de tela sob demanda e retenção de dados.
- Script de inicialização para reduzir a fricção de uso e aproximar a experiência de um aplicativo real.
- Base documental consolidada com especificação técnica, plano de desenvolvimento e backlog de melhorias e bugs.

## Estrutura do Projeto

- **/app**: frontend em React + TypeScript + Vite, incluindo canvas, widgets, armazenamento local e componentes de interface.
- **/agent**: agente local em Python com FastAPI, WebSocket e serviços de monitoramento.
- **/bugs_melhorias_novos**: registro de melhorias, bugs e ideias de evolução.

## Requisitos de Ambiente

- Node.js >= 18
- Python >= 3.10
- Compatível com Windows e Linux

## Como Executar

### 1. Frontend (/app)
```bash
cd app
npm install
npm run dev
```
Acesse http://localhost:5173.

### 2. Agente local (/agent)
```bash
cd agent
python -m venv .venv
# Linux: source .venv/bin/activate
# Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m src.main
```

## Documentação e planejamento

- [dashboard-widgets-spec.md](./dashboard-widgets-spec.md): especificação técnica inicial.
- [plano-de-desenvolvimento.md](./plano-de-desenvolvimento.md): plano de desenvolvimento por fases.
- [plano-operacional-execucao.md](./plano-operacional-execucao.md): visão operacional da implementação.

## Status Atual

O projeto está em fase de validação de integração entre frontend e agente local, com foco em experiência de uso, estabilidade e evolução dos widgets.
