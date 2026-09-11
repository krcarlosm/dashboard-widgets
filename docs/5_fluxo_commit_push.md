# Fluxo de Alterações, Commit e Push

Este guia descreve o procedimento recomendado para implementar uma alteração pontual, testar localmente, criar um commit e enviar o resultado para o GitHub.

## Visão geral

O fluxo normal é:

1. Atualizar a branch local.
2. Fazer uma alteração pequena e bem delimitada.
3. Executar o teste local correspondente.
4. Revisar as diferenças.
5. Adicionar somente os arquivos relacionados.
6. Criar o commit.
7. Enviar com `git push`.
8. Confirmar que local e remoto estão sincronizados.

O `force push` não faz parte do fluxo normal. Ele substitui o histórico remoto e só deve ser usado quando essa substituição for intencional.

## 1. Confirmar o estado antes de começar

Execute os comandos na raiz do repositório:

```powershell
git status --short --branch
git fetch origin
git pull --rebase origin main
```

O `pull --rebase` traz commits novos do GitHub para a branch local sem criar automaticamente um commit de merge.

Se o resultado indicar que a branch está limpa e sincronizada, você pode começar a alteração:

```text
## main...origin/main
```

Se aparecerem arquivos modificados, revise-os antes de executar o `pull` e decida se eles fazem parte da alteração atual.

## 2. Implementar e testar a alteração

Faça a alteração somente nos arquivos necessários. Para o frontend, o build verifica TypeScript e a compilação do Vite:

```powershell
Set-Location app
npm run build
Set-Location ..
```

Para uma verificação rápida do código Python do agente:

```powershell
python -m compileall agent/src
```

Se houver um teste específico para a alteração, execute-o também. Por exemplo, uma alteração no widget de notas deve ser testada abrindo o dashboard, criando ou editando uma nota e recarregando a página para confirmar a persistência.

O commit deve ser feito somente depois que o comportamento esperado funcionar no ambiente local.

## 3. Revisar as alterações

Na raiz do projeto:

```powershell
git status
git diff
git diff --check
```

- `git status` mostra arquivos modificados, removidos e novos.
- `git diff` mostra o conteúdo alterado.
- `git diff --check` identifica espaços indevidos e problemas simples de formatação.

Leia a diferença como se estivesse revisando o trabalho de outra pessoa. Confirme se não há código de teste temporário, credenciais, arquivos gerados ou mudanças não relacionadas.

## 4. Adicionar somente os arquivos corretos

Prefira informar os caminhos explicitamente:

```powershell
git add app/src/widgets/notes/index.tsx
git add app/src/components/WidgetContainer.tsx
```

Para selecionar partes específicas de um arquivo:

```powershell
git add -p
```

Evite usar `git add .` sem revisar o resultado. O repositório pode conter arquivos gerados, como arquivos dentro de `__pycache__`, ou documentos novos que não pertencem ao mesmo trabalho.

Depois de adicionar os arquivos, revise o que realmente entrará no commit:

```powershell
git diff --cached
```

Se um arquivo foi adicionado por engano, remova-o da área de preparação sem apagar seu conteúdo:

```powershell
git restore --staged caminho/do/arquivo
```

## 5. Criar o commit

Quando a revisão estiver correta:

```powershell
git commit -m "fix(widget): corrige persistencia das notas"
```

Exemplos de mensagens:

```text
feat(widget): adiciona conversor de moedas
fix(agent): corrige reconexao do websocket
docs: atualiza guia de execucao
refactor(canvas): simplifica persistencia do layout
```

Uma boa mensagem informa o tipo da mudança e o resultado principal. Evite mensagens vagas como `ajustes`, `mudancas` ou `teste`.

O commit é local. Ele ainda não foi enviado ao GitHub.

## 6. Enviar para o GitHub

Depois que o commit for criado:

```powershell
git push origin main
```

Ao concluir, confirme o estado:

```powershell
git status --short --branch
git log -1 --oneline
```

O estado esperado é semelhante a:

```text
## main...origin/main
```

Isso significa que a branch local e `origin/main` estão no mesmo ponto.

## Fluxo completo de exemplo

Exemplo de uma correção em um widget do frontend:

```powershell
# Atualizar antes de começar
git pull --rebase origin main

# Implementar a alteração e testar
Set-Location app
npm run build
Set-Location ..

# Revisar
git diff --check
git diff

# Preparar somente o arquivo alterado
git add app/src/widgets/notes/index.tsx
git diff --cached

# Registrar e enviar
git commit -m "fix(notes): corrige salvamento do conteudo"
git push origin main

git status --short --branch
```

## Erros comuns e correções

### `rejected` ou `non-fast-forward`

Mensagem típica:

```text
! [rejected] main -> main (non-fast-forward)
```

Isso significa que o remoto recebeu commits que ainda não estão na sua branch local. Não use `--force` automaticamente. Atualize sua branch e reaplique seu commit:

```powershell
git pull --rebase origin main
```

Depois execute os testes novamente e tente o push:

```powershell
git push origin main
```

### Conflito durante o rebase

O Git informará os arquivos conflitantes. Abra cada arquivo, escolha manualmente o conteúdo correto e remova os marcadores `<<<<<<<`, `=======` e `>>>>>>>`.

Depois:

```powershell
git add caminho/do/arquivo

git rebase --continue
```

Repita até o rebase terminar. Em seguida, execute os testes novamente e faça o push.

Para cancelar o rebase e retornar ao estado anterior:

```powershell
git rebase --abort
```

### O commit inclui arquivos errados

Antes do commit, retire o arquivo da área de preparação:

```powershell
git restore --staged caminho/do/arquivo
```

Se o commit já foi criado, mas ainda não foi enviado, corrija a seleção e recrie o último commit:

```powershell
git reset --soft HEAD~1
git restore --staged caminho/do/arquivo
```

Revise novamente com `git diff --cached` e faça o commit correto.

### `nothing to commit`

Isso significa que não há alterações preparadas ou que a alteração já foi commitada. Confira:

```powershell
git status
git log -3 --oneline
```

Se o commit já existir, basta executar `git push origin main`.

### `npm run build` falha

Leia a primeira mensagem de erro, corrija o arquivo indicado e execute novamente:

```powershell
Set-Location app
npm run build
Set-Location ..
```

Não crie o commit enquanto o build necessário para a alteração estiver falhando. Se a falha não tiver relação com seu trabalho, registre o problema e avalie o impacto antes de prosseguir.

### O push pede autenticação ou falha por permissão

Confirme o remoto configurado:

```powershell
git remote -v
```

O endereço deve apontar para o repositório correto. Se a autenticação do GitHub falhar, faça login pelo método configurado na sua máquina ou peça acesso ao repositório. Não coloque tokens ou senhas em arquivos do projeto nem em mensagens de commit.

### A branch está em estado `detached HEAD`

Você não está em uma branch normal. Confira:

```powershell
git branch --show-current
git status
```

Para voltar à branch principal sem apagar alterações não commitadas:

```powershell
git switch main
```

Se o Git impedir a troca por causa de alterações locais, preserve-as primeiro com um commit apropriado ou com `git stash`.

## Quando usar `force push`

Use somente quando for necessário substituir deliberadamente o histórico remoto, por exemplo após reescrever commits locais e com a concordância de quem utiliza o repositório.

Prefira a forma protegida:

```powershell
git fetch origin
git push --force-with-lease origin main
```

O `--force-with-lease` evita sobrescrever alterações remotas que não estavam presentes na sua última referência local. Mesmo assim, ele pode remover commits do histórico remoto, portanto não deve ser usado como solução para um push rejeitado comum.

## Regra prática

Depois de cada alteração bem-sucedida:

```powershell
git diff --check
git add <arquivos-relacionados>
git diff --cached
git commit -m "tipo: descricao"
git push origin main
git status --short --branch
```

A sequência mais importante é: **testar, revisar, preparar, commitar e só então enviar**.
