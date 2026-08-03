# Plano operacional de execução do dashboard

## 1. Propósito deste documento

Este documento transforma o plano de melhoria em uma execução operacional, com backlog priorizado, ordem de implementação e prompts localizados para orientar um agente de IA durante a execução.

O objetivo é reduzir interpretação, evitar refatoração desnecessária e manter o desenvolvimento alinhado com a estrutura atual do projeto.

---

## 2. Diretrizes gerais para a execução

### Regras de implementação
- Respeitar a arquitetura atual do frontend em [app/src/App.tsx](app/src/App.tsx), [app/src/store/dashboardStore.ts](app/src/store/dashboardStore.ts), [app/src/components/Canvas.tsx](app/src/components/Canvas.tsx) e [app/src/components/Sidebar.tsx](app/src/components/Sidebar.tsx).
- Preferir mudanças pequenas e localizadas em vez de reescrever módulos inteiros.
- Manter compatibilidade com o estado atual de widgets, persistência e layout do dashboard.
- No agente Python, preservar o modelo atual em [agent/src/main.py](agent/src/main.py) e [agent/src/protocol.py](agent/src/protocol.py), expandindo-o com novos tipos de mensagem e handlers sem quebrar o fluxo existente.
- Não implementar captura automática de tela nem monitoramento contínuo sem solicitação explícita do usuário.
- Sempre que uma dependência nova for necessária, atualizar o arquivo de dependências do agente e informar o usuário antes de proceder.
- Priorizar entregas que melhorem usabilidade, estabilidade e integração real com o agente local.

### Regras de comunicação para o agente IA
- Trabalhar em ordem crescente de complexidade.
- Completar uma etapa antes de iniciar a seguinte.
- Sempre validar o impacto em UI e em persistência.
- Evitar criar camadas abstratas quando uma solução simples resolve o problema.
- Se uma melhoria depender de outro módulo ainda não implementado, deixar claro na documentação e executar a dependência antes.

---

## 3. Backlog priorizado

### P0 — Fundação e impacto imediato

| ID | Tema | Prioridade | Impacto |
|---|---|---|---|
| P0-01 | Ajustes visuais e posicionamento de botões | Alta | Melhor UX imediata |
| P0-02 | Reorganização automática do canvas e foco ao adicionar widgets | Alta | Melhora muito a navegação |
| P0-03 | Ação de abrir o canvas completo e padronizar layout | Média | Melhora a organização visual |
| P0-04 | Centralização de temas e aparência global | Média | Facilita manutenção e personalização |

### P1 — Melhorias de widgets e experiência do usuário

| ID | Tema | Prioridade | Impacto |
|---|---|---|---|
| P1-01 | Edição de tarefas existentes | Alta | Resolve problema de uso real |
| P1-02 | Gerenciador de snippets com scroll, categorias e favoritos | Alta | Melhora organização e legibilidade |
| P1-03 | Editor de notas com modos texto/rich text/markdown | Média | Incrementa valor do widget |
| P1-04 | Timer com regra de segurança ao mudar de modo | Média | Evita comportamento inesperado |
| P1-05 | Botão de reset global do dashboard | Média | Útil para limpeza e testes |

### P2 — Base do agente local e recursos de integração

| ID | Tema | Prioridade | Impacto |
|---|---|---|---|
| P2-01 | Autenticação local no handshake | Alta | Segurança e base da fase 3 |
| P2-02 | Monitoramento de clipboard | Alta | Recurso central da fase 3 |
| P2-03 | Captura de tela sob demanda | Alta | Recurso central da fase 3 |
| P2-04 | Expurgo automático de dados antigos | Média | Gestão de armazenamento |
| P2-05 | Indexação local de arquivos editados | Média | Prepara integração futura |
| P2-06 | Script de inicialização do dashboard | Média | Melhora execução real |

### P3 — Recursos avançados

| ID | Tema | Prioridade | Impacto |
|---|---|---|---|
| P3-01 | Mini-Kanban | Média | Novo widget de valor |
| P3-02 | Widgets adicionais baseados em automação e monitoramento | Baixa | Expansão futura |

---

## 4. Ordem recomendada de implementação

### Fase 1 — Ajustes rápidos e de baixo risco
1. Ajustes visuais e posicionamento de botões.
2. Reorganização automática do canvas.
3. Foco automático e visualização completa do canvas.
4. Melhorias de ícones e identidade visual.

### Fase 2 — Melhorias de widgets existentes
1. Edição de tarefas.
2. Melhoras no gerenciador de snippets.
3. Editor de notas com modos de texto.
4. Ajustes de comportamento do timer.

### Fase 3 — Base operacional do dashboard
1. Centralização de temas e aparência.
2. Botão de reset global do dashboard.
3. Script de inicialização com um clique.

### Fase 4 — Implementação do agente local
1. Autenticação local.
2. Handshake seguro.
3. Monitoramento de clipboard.
4. Captura de tela sob demanda.
5. Expurgo automático.
6. Indexação de arquivos.

### Fase 5 — Novos widgets e expansão
1. Mini-Kanban.
2. Widgets adicionais e integrações futuras.

---

## 5. Tarefas detalhadas com prompts localizados

### Tarefa 1 — Ajustes visuais e posicionamento de botões

Objetivo:
- Afastar o botão de bloqueio do botão de fechar.
- Posicionar o botão de adicionar abaixo da descrição do widget.
- Melhorar a leitura visual da sidebar e do canvas.

Arquivos-alvo:
- [app/src/components/Sidebar.tsx](app/src/components/Sidebar.tsx)
- [app/src/components/WidgetContainer.tsx](app/src/components/WidgetContainer.tsx)

Implementação:
- Ajustar espaçamento e alinhamento.
- Reduzir sobreposição visual.
- Preservar comportamento atual do layout.

Critérios de aceite:
- Nenhum botão cobre texto importante.
- O layout continua responsivo.
- Não há regressão na interação com widgets.

Prompt local:
```text
Implemente melhorias visuais e de posicionamento no dashboard. Ajuste o layout dos botões de ação para evitar sobreposição, mantenha o comportamento atual e preserve a experiência de uso. Foque em Sidebar e WidgetContainer, sem reescrever o restante da interface.
```

---

### Tarefa 2 — Reorganização automática do canvas

Objetivo:
- Criar um botão de reorganizar na área de ações do dashboard.
- Distribuir widgets automaticamente ocupando 100% das colunas disponíveis.
- Não afetar widgets bloqueados.

Arquivos-alvo:
- [app/src/components/Canvas.tsx](app/src/components/Canvas.tsx)
- [app/src/store/dashboardStore.ts](app/src/store/dashboardStore.ts)

Implementação:
- Adicionar uma função de reorganização no store.
- Recalcular layouts levando em conta widgets bloqueados.
- Expor a ação por botão de UI.

Critérios de aceite:
- Widgets não bloqueados são reorganizados automaticamente.
- Widgets bloqueados permanecem em posição fixa.
- A reorganização não quebra o estado salvo.

Prompt local:
```text
Adicione uma ação de reorganização do canvas no frontend. A implementação deve reorganizar automaticamente os widgets ativos que não estão bloqueados, ocupando o máximo possível das colunas do grid. Preserve o estado salvo e não mexa em widgets bloqueados.
```

---

### Tarefa 3 — Foco automático ao adicionar widgets e visão completa do canvas

Objetivo:
- Ao adicionar um widget, a tela deve se mover automaticamente para o novo item.
- Criar uma ação para visualizar o canvas completo.

Arquivos-alvo:
- [app/src/components/Canvas.tsx](app/src/components/Canvas.tsx)
- [app/src/store/dashboardStore.ts](app/src/store/dashboardStore.ts)

Implementação:
- Após adicionar um widget, deslocar a view para o novo item.
- Criar uma ação de zoom/visualização completa com foco no canvas.

Critérios de aceite:
- O usuário vê o widget recém-adicionado sem rolagem manual.
- A ação de visualização completa não quebra o layout do canvas.

Prompt local:
```text
Melhore a experiência de navegação no canvas. Ao adicionar um widget, mova automaticamente o viewport para a posição do novo item. Adicione também uma ação visual para exibir o canvas completo sem quebrar os layouts atuais.
```

---

### Tarefa 4 — Edição de tarefas existentes

Objetivo:
- Permitir editar uma tarefa após sua criação.
- Preservar o fluxo atual de marcar como concluída com um clique.

Arquivos-alvo:
- [app/src/widgets/todo/index.tsx](app/src/widgets/todo/index.tsx)

Implementação:
- Adicionar um modo de edição ao clicar duas vezes rapidamente.
- Manter um clique para alternar estado concluído.
- Atualizar o estado salvo no storage do widget.

Critérios de aceite:
- Tarefas podem ser alteradas sem apagá-las.
- O comportamento de concluir continua funcionando.
- O estado persiste entre reloads.

Prompt local:
```text
Atualize o widget de tarefas para permitir edição de itens já criados. Preserve a regra de um clique para concluir e implemente edição com interação dupla simples. Não altere a estrutura geral do widget.
```

---

### Tarefa 5 — Gerenciador de snippets com categorias, scroll e favoritos

Objetivo:
- Melhorar a legibilidade do widget de snippets.
- Adicionar scroller vertical quando houver muitos itens.
- Permitir agrupar por categoria e destacar favoritos.

Arquivos-alvo:
- [app/src/widgets/snippets/index.tsx](app/src/widgets/snippets/index.tsx)

Implementação:
- Criar filtros: todos, categorias e favoritos.
- Adicionar scroll vertical quando o conteúdo exceder o espaço.
- Manter compatibilidade com o modelo atual de dados.

Critérios de aceite:
- O widget permanece utilizável com muitos snippets.
- A filtragem por categoria funciona.
- Favoritos podem ser marcados e exibidos separadamente.

Prompt local:
```text
Melhore o widget de snippets com uma experiência mais estável e organizada. Adicione scroll vertical, agrupamento por categoria e um modo de favoritos sem quebrar o armazenamento atual do widget.
```

---

### Tarefa 6 — Editor de notas com modos de texto

Objetivo:
- Permitir que o usuário escolha entre texto simples, rich text e markdown.
- Oferecer renderização de markdown quando solicitado.

Arquivos-alvo:
- [app/src/widgets/notes/index.tsx](app/src/widgets/notes/index.tsx)

Implementação:
- Criar seletor de modo de edição.
- Implementar modo de visualização simples para markdown.
- Preservar o conteúdo salvo.

Critérios de aceite:
- O usuário pode alternar entre os modos.
- O conteúdo salvo é preservado ao trocar de modo.
- Nenhum comportamento atual é removido sem necessidade.

Prompt local:
```text
Atualize o widget de anotações para suportar texto simples, rich text e markdown. Implemente a troca entre modos de forma simples e preserve o conteúdo já salvo pelo widget.
```

---

### Tarefa 7 — Ajustes do timer para segurança de modo

Objetivo:
- Evitar que o usuário mude de modo durante a execução do timer sem cancelar ou esperar o ciclo.

Arquivos-alvo:
- [app/src/widgets/pomodoro/index.tsx](app/src/widgets/pomodoro/index.tsx)

Implementação:
- Desativar ou esconder a troca de modo enquanto o timer estiver rodando.
- Permitir mudança somente após cancelamento ou finalização.

Critérios de aceite:
- O modo não muda durante a contagem ativa.
- O usuário consegue cancelar ou aguardar para alterar o modo.

Prompt local:
```text
Ajuste o comportamento do widget de timer para impedir mudanças de modo durante a execução ativa. Mantenha a experiência do usuário simples e consistente com o fluxo atual.
```

---

### Tarefa 8 — Centralização de temas e aparência global

Objetivo:
- Criar um ponto único para personalizar tema, grid, espaçamento e cores.

Arquivos-alvo:
- [app/src/index.css](app/src/index.css)
- [app/src/components/Canvas.tsx](app/src/components/Canvas.tsx)
- [app/src/components/Sidebar.tsx](app/src/components/Sidebar.tsx)

Implementação:
- Centralizar constantes visuais em um arquivo de tema compartilhado.
- Substituir valores dispersos por referências a esse tema.

Critérios de aceite:
- A aparência global passa a ser alterada em um único ponto.
- O dashboard continua visualmente compatível com o atual.

Prompt local:
```text
Centralize as configurações visuais do dashboard em um único arquivo de tema. Mantenha o visual atual, mas extrai valores de cor, espaçamento, grid e bordas para um ponto único de manutenção.
```

---

### Tarefa 9 — Botão de reset global do dashboard

Objetivo:
- Criar um botão para encerrar aplicativos, limpar dados e reiniciar o ambiente local do dashboard.

Arquivos-alvo:
- [app/src/store/dashboardStore.ts](app/src/store/dashboardStore.ts)
- [app/src/components/Sidebar.tsx](app/src/components/Sidebar.tsx)

Implementação:
- Adicionar uma ação de limpeza global.
- Limpar widgets ativos e dados persistidos do dashboard.
- Preservar o comportamento de uso normal após o reset.

Critérios de aceite:
- A ação remove os widgets ativos e os dados associados.
- O dashboard volta a um estado limpo sem quebrar a UI.

Prompt local:
```text
Adicione uma ação de reset global do dashboard. A implementação deve limpar widgets ativos e dados persistidos de forma segura, sem causar regressão na interface.
```

---

### Tarefa 10 — Script de inicialização com um clique

Objetivo:
- Facilitar a execução do dashboard completo com um único comando.

Arquivos-alvo:
- raiz do projeto
- [README.md](README.md)

Implementação:
- Criar um script de inicialização para frontend e agente.
- Garantir que o ambiente virtual e o dashboard sejam levantados de forma simples.

Critérios de aceite:
- O usuário consegue iniciar o fluxo principal com um único comando.
- O processo é documentado claramente.

Prompt local:
```text
Crie um fluxo de inicialização simples para o dashboard e o agente local. O resultado deve permitir iniciar o projeto com um único comando, mantendo a documentação clara para o usuário.
```

---

### Tarefa 11 — Autenticação local no agente

Objetivo:
- Proteger o WebSocket do agente com token local.
- Evitar conexões não autorizadas.

Arquivos-alvo:
- [agent/src/main.py](agent/src/main.py)
- [agent/src/protocol.py](agent/src/protocol.py)

Implementação:
- Criar um token persistido localmente.
- Exigir o token no handshake.
- Rejeitar conexões com token inválido.

Critérios de aceite:
- O handshake funciona com token correto.
- O handshake é rejeitado com token incorreto.
- O agente continua respondendo a ping e pong.

Prompt local:
```text
Implemente autenticação local no agente Python. O handshake deve exigir um token válido, salvo localmente, e rejeitar tentativas não autorizadas sem quebrar o fluxo atual de ping/pong.
```

---

### Tarefa 12 — Monitoramento de clipboard

Objetivo:
- Capturar texto e imagem colocados na área de transferência.
- Enviar evento ao frontend sem depender de ação manual contínua.

Arquivos-alvo:
- [agent/src/main.py](agent/src/main.py)
- [agent/src/protocol.py](agent/src/protocol.py)

Implementação:
- Criar um loop assíncrono de monitoramento.
- Salvar conteúdo em diretório local dedicado.
- Emitir evento com tipo e caminho do arquivo criado.

Critérios de aceite:
- Texto copiado gera arquivo e evento.
- Imagem copiada gera arquivo e evento.
- Conteúdo duplicado não gera duplicação indevida.

Prompt local:
```text
Implemente o monitoramento de clipboard no agente local. O fluxo deve observar alterações na área de transferência, salvar os dados em um diretório local apropriado e emitir um evento estruturado para o frontend sem criar comportamento automático indevido.
```

---

### Tarefa 13 — Captura de tela sob demanda

Objetivo:
- Permitir captura de tela somente quando o usuário solicitar explicitamente.

Arquivos-alvo:
- [agent/src/main.py](agent/src/main.py)
- [agent/src/protocol.py](agent/src/protocol.py)

Implementação:
- Criar um tipo de mensagem para solicitação de captura.
- Responder com o caminho do arquivo gerado.
- Garantir que não existam capturas automáticas.

Critérios de aceite:
- A captura ocorre somente após ação explícita do usuário.
- O arquivo gerado é salvo em local controlado pelo agente.
- O fluxo retorna o caminho corretamente.

Prompt local:
```text
Adicione a funcionalidade de captura de tela sob demanda ao agente. A implementação deve ser acionada por uma mensagem explícita do frontend e nunca ocorrer automaticamente.
```

---

### Tarefa 14 — Expurgo automático de arquivos antigos

Objetivo:
- Remover dados antigos para manter o armazenamento controlado.

Arquivos-alvo:
- [agent/src/main.py](agent/src/main.py)

Implementação:
- Criar job periódico de limpeza.
- Remover arquivos antigos com base em retenção de 7 dias.
- Registrar log simples de auditoria.

Critérios de aceite:
- Arquivos antigos são removidos.
- Arquivos recentes permanecem.
- O log de expurgo é gerado.

Prompt local:
```text
Implemente um mecanismo de expurgo automático para os arquivos gerados pelo agente. O processo deve remover dados antigos de forma periódica, preservando o que está recente e registrando a ação em log.
```

---

### Tarefa 15 — Indexação local de arquivos editados

Objetivo:
- Preparar a base para o futuro widget de monitoramento de arquivos.

Arquivos-alvo:
- [agent/src/main.py](agent/src/main.py)

Implementação:
- Criar uma lista persistente de pastas monitoradas.
- Registrar alterações em banco local simples.
- Evitar indexar tudo automaticamente sem autorização.

Critérios de aceite:
- Alterações em pastas autorizadas são registradas.
- Alterações em pastas não autorizadas não geram registro.
- As configurações persistem entre reinícios.

Prompt local:
```text
Implemente a base de indexação local de arquivos editados. O agente deve registrar eventos somente para pastas autorizadas pelo usuário e preservar essa configuração entre reinícios.
```

---

### Tarefa 16 — Mini-Kanban

Objetivo:
- Criar um novo widget simples de organização visual.

Arquivos-alvo:
- [app/src/widgets](app/src/widgets)
- [app/src/App.tsx](app/src/App.tsx)

Implementação:
- Registrar o novo widget no dashboard.
- Criar colunas simples: a fazer, em andamento e concluído.
- Permitir movimentação por arraste ou botões internos.

Critérios de aceite:
- O widget é exibido e interage corretamente.
- O estado persiste localmente.
- A interface mantém simplicidade.

Prompt local:
```text
Crie um novo widget de tipo Mini-Kanban com colunas simples e cards curtos. O widget deve ser registrável no dashboard e funcionar de forma simples, sem depender de bibliotecas adicionais.
```

---

## 6. Critérios de conclusão por fase

### Fase 1 concluída quando:
- os ajustes visuais e do layout estão implementados;
- a reorganização do canvas funciona;
- a navegação do dashboard ficou mais intuitiva.

### Fase 2 concluída quando:
- tarefas podem ser editadas;
- snippets e notas funcionam melhor;
- o timer não permite mudanças inesperadas de modo.

### Fase 3 concluída quando:
- o dashboard tem uma forma centralizada de configuração visual;
- existe um fluxo de reset global e um script de inicialização simples.

### Fase 4 concluída quando:
- o agente exige e valida token local;
- clipboard, screenshot e expurgo funcionam com fluxo simples e previsível;
- o agente mantém integração estável com o frontend.

---

## 7. Checklist de validação antes de avançar

- O código continua buildando no frontend.
- O agente continua iniciando corretamente.
- O fluxo de handshake continua funcionando.
- O dashboard não perde widgets ou configurações após reload.
- Novas dependências foram documentadas e adicionadas corretamente.

---

## 8. Prompt mestre para execução sequencial

Use este prompt como entrada principal para um agente de IA quando for executar este plano de forma incremental:

```text
Atue como um desenvolvedor principal deste projeto. Siga este plano operacional em ordem, começando pelas tarefas mais simples e de baixo risco. Priorize mudanças pequenas, compatíveis com a estrutura atual do frontend React/TypeScript e do agente Python. Preserve o funcionamento existente, evite refatorações desnecessárias, mantenha compatibilidade com persistência e layout do dashboard e documente qualquer dependência nova antes de implementá-la. Execute uma tarefa por vez, valide o resultado e só avance para a próxima quando a anterior estiver estável.
```
