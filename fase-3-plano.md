# Fase 3 — Local Agent (Python): Plano de Implementação

> Ponto de partida: esqueleto já existente (`main.py` + `protocol.py`) com FastAPI, WebSocket em `127.0.0.1:8765`, handshake e ping/pong funcionando. Esta fase estende esse esqueleto para os recursos reais: autenticação, monitor de clipboard (texto/imagem), screenshot sob demanda, expurgo de 7 dias e indexação de arquivos.

Não há pergunta bloqueante para começar o plano, mas registro abaixo as **premissas assumidas** onde havia mais de um caminho razoável — se alguma estiver errada, é só sinalizar e ajusto o documento:

- Como você está em ambiente Windows agora, o plano prioriza **implementar e validar primeiro no Windows**, com a camada Linux (X11/Wayland) estruturada via abstração de plataforma, mas testada depois, quando você estiver no Zorin OS.
- Concorrência dentro do Agent via **tasks assíncronas do próprio event loop do FastAPI/uvicorn** (`asyncio.create_task`), não threads separadas — evita complexidade de sincronização, e as operações em jogo (polling de clipboard, job de expurgo) são leves o suficiente para não bloquear o loop se implementadas com `await asyncio.sleep`.
- Local de armazenamento do Agent: `Path.home() / ".dashboard-agent"` (equivalente a `C:\Users\<usuário>\.dashboard-agent` no Windows e `~/.dashboard-agent` no Linux) — mesma lógica em ambos os SOs via `pathlib`.

---

## 1. Estrutura de Pastas Proposta

```
agent/
├── src/
│   ├── main.py                 # já existe — vai crescer para registrar os novos handlers
│   ├── protocol.py             # já existe — vai ganhar novos tipos de mensagem
│   ├── auth.py                 # NOVO: geração/validação do token local
│   ├── clipboard/
│   │   ├── monitor.py          # NOVO: loop de polling
│   │   └── platform_reader.py  # NOVO: abstração Windows/Linux
│   ├── screenshot/
│   │   └── capture.py          # NOVO: captura sob demanda via mss
│   ├── retention/
│   │   └── purge.py            # NOVO: job de expurgo de 7 dias
│   └── indexing/
│       └── file_watcher.py     # NOVO: watchdog para o widget Top 10 (preparação p/ Fase 4)
└── data/                        # criado em runtime, não versionado no git
    └── (mapeia para ~/.dashboard-agent/)
```

---

## 2. Autenticação Local

**Problema a resolver:** hoje o `CORSMiddleware` está com `allow_origins=["*"]` e o WebSocket aceita qualquer handshake — qualquer processo na máquina poderia se conectar ao Agent.

### Fluxo
1. Na primeira execução, o Agent gera um token aleatório (`secrets.token_hex(32)`) e salva em `~/.dashboard-agent/auth.token`
2. O frontend, ao detectar que nunca se conectou a esse Agent, **lê esse arquivo via File System Access API** (o usuário aponta a pasta uma vez) ou — alternativa mais simples — **o Agent expõe o token via um endpoint HTTP local só na primeira execução**, exibido também em texto simples no terminal para o usuário copiar manualmente na UI
3. Toda mensagem `handshake` passa a exigir o token no payload; se inválido, o Agent fecha a conexão WebSocket imediatamente com log de tentativa não autorizada

**Decisão recomendada para esta fase:** usar a opção mais simples (token exibido no terminal + colado manualmente uma vez na UI, que aí o frontend salva no seu próprio storage local). Evita depender de permissão de sistema de arquivos só para ler um token.

### Extensão do protocolo (`protocol.py`)
```python
class HandshakePayload(BaseModel):
    client: str = "dashboard-ui"
    version: str = "0.1.0"
    token: str  # NOVO campo obrigatório
```

### Alteração no `main.py`
- `handshake` só responde `handshake:ack` se `payload.token` bater com o token salvo em disco
- Caso contrário: responder `handshake:rejected` e chamar `websocket.close(code=4001)`

**Checklist:**
- [ ] Token gerado uma única vez, reaproveitado em reinícios do Agent
- [ ] Handshake com token errado é rejeitado e logado
- [ ] Handshake com token certo funciona como hoje

---

## 3. Monitor de Clipboard (texto vs. imagem)

### Abstração de plataforma
```python
# platform_reader.py
class ClipboardReader(Protocol):
    def read(self) -> ClipboardContent | None: ...

class WindowsClipboardReader:
    # usa win32clipboard (pywin32) — CF_TEXT / CF_UNICODETEXT para texto,
    # CF_DIB / CF_BITMAP para imagem
    ...

class LinuxClipboardReader:
    # pyperclip para texto; subprocess para `xclip`/`wl-paste` para imagem
    # (detectar sessão X11 vs Wayland via variável de ambiente XDG_SESSION_TYPE)
    ...

def get_reader() -> ClipboardReader:
    return WindowsClipboardReader() if platform.system() == "Windows" else LinuxClipboardReader()
```

Como você está validando em Windows agora, a implementação inicial e os testes reais começam pelo `WindowsClipboardReader`. O `LinuxClipboardReader` é escrito em conjunto (mesma interface), mas sua validação prática fica para quando você migrar para o Zorin OS — nesse momento é só rodar o Agent lá e confirmar.

### Loop de monitoramento
```python
async def clipboard_monitor_loop(broadcast_fn):
    reader = get_reader()
    last_hash = None
    while True:
        content = reader.read()
        if content and content.hash != last_hash:
            last_hash = content.hash
            saved_path = save_to_bau(content)  # ver seção de armazenamento abaixo
            await broadcast_fn(AgentMessage(
                type="clipboard:event",
                payload={"kind": content.kind, "path": str(saved_path), "timestamp": time.time()}
            ))
        await asyncio.sleep(0.8)
```
- Deduplicação via hash do conteúdo (evita salvar repetido ao selecionar o mesmo texto várias vezes)
- Intervalo de 800ms — suficiente para parecer "instantâneo" ao usuário sem gerar carga de CPU perceptível

### Armazenamento
```
~/.dashboard-agent/bau/
├── imagens/
│   ├── clipboard_1721654321.png
│   └── screenshot_1721654400.png   # ver seção 4
└── textos/
    └── clipboard_1721654321.txt
```

### Extensão do protocolo
Novo tipo de mensagem emitido pelo Agent (sem o frontend precisar pedir — é um evento push):
```json
{ "type": "clipboard:event", "payload": { "kind": "image", "path": "...", "timestamp": 1721654321 } }
```

**Checklist:**
- [ ] Copiar texto no Windows gera arquivo em `textos/` e evento `clipboard:event` chega no frontend
- [ ] Copiar imagem (ex: print de tela colado, ou copiar imagem de um site) gera arquivo em `imagens/`
- [ ] Copiar o mesmo conteúdo duas vezes seguidas não duplica o arquivo
- [ ] Loop não trava nem vaza memória rodando por horas (validar com o Agent aberto um dia inteiro)

---

## 4. Captura de Tela Sob Demanda

**Reforço do requisito:** captura **só** acontece quando o usuário clica no botão do widget no frontend — nunca em loop, nunca automática.

### Endpoint
Em vez de expor isso como HTTP REST separado, mantemos tudo no mesmo canal WebSocket já estabelecido (mais simples, um único ponto de autenticação):

```json
// Frontend → Agent
{ "type": "screenshot:request", "payload": {} }

// Agent → Frontend
{ "type": "screenshot:result", "payload": { "path": "...", "timestamp": 1721654400 } }
```

### Implementação
```python
# capture.py
import mss

def take_screenshot() -> Path:
    with mss.mss() as sct:
        monitor = sct.monitors[0]  # todos os monitores; refinar para monitor ativo é melhoria futura
        img = sct.grab(monitor)
        path = BAU_DIR / "imagens" / f"screenshot_{int(time.time())}.png"
        mss.tools.to_png(img.rgb, img.size, output=str(path))
        return path
```

**Nota de escopo:** capturar "o monitor ativo" (onde está o cursor) exige lógica adicional de detecção de monitor — para esta fase, capturar todos os monitores combinados é aceitável; refinar isso pode entrar como melhoria incremental depois, sem quebrar o contrato do protocolo.

**Checklist:**
- [ ] Clique no botão do widget gera exatamente um arquivo, nunca mais de um
- [ ] Nenhuma captura ocorre sem essa ação explícita (validar deixando o Agent aberto por um tempo sem clicar em nada)
- [ ] Arquivo aparece corretamente nomeado com prefixo `screenshot_` (distinto de `clipboard_`)

---

## 5. Expurgo Automático (Retenção de 7 dias)

```python
# purge.py
async def purge_loop():
    while True:
        cutoff = time.time() - (7 * 24 * 60 * 60)
        removed = []
        for folder in [BAU_DIR / "imagens", BAU_DIR / "textos"]:
            for f in folder.iterdir():
                if f.stat().st_mtime < cutoff:
                    removed.append(str(f))
                    f.unlink()
        if removed:
            logger.info(f"Expurgo: {len(removed)} arquivo(s) removido(s)")
            write_purge_log(removed)
        await asyncio.sleep(6 * 60 * 60)  # a cada 6h
```
- Roda como task de background iniciada junto com o app (`@app.on_event("startup")`)
- Log de auditoria simples em `~/.dashboard-agent/purge.log` (append-only, uma linha por execução do job com contagem e lista de arquivos removidos)

**Checklist:**
- [ ] Arquivo com `mtime` forçado para >7 dias atrás (via teste manual, alterando a data do arquivo) é removido no próximo ciclo
- [ ] Arquivo recente não é tocado
- [ ] Log de expurgo é gravado corretamente

---

## 6. Indexação de Arquivos Editados (preparação para a Fase 4)

Esta fase entrega a **coleta de dados**; a UI do widget Top 10 fica para a Fase 4. Adiantar aqui evita que a Fase 4 comece sem histórico acumulado.

```python
# file_watcher.py
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

class EditIndexHandler(FileSystemEventHandler):
    def on_modified(self, event):
        if not event.is_directory:
            record_edit(event.src_path, time.time())  # grava em SQLite local
```
- Pastas monitoradas: lista configurável, **vazia por padrão** (o usuário autoriza explicitamente quais pastas indexar — isso será uma tela na Fase 4, mas o mecanismo de armazenar a lista de pastas autorizadas já pode ser criado agora em `~/.dashboard-agent/watched_folders.json`)
- Banco local leve: SQLite (`~/.dashboard-agent/edits_index.db`) com tabela `(path TEXT, modified_at REAL)`

**Checklist:**
- [ ] Editar um arquivo dentro de uma pasta autorizada gera um registro no SQLite
- [ ] Editar um arquivo fora das pastas autorizadas não gera nada
- [ ] Lista de pastas autorizadas persiste entre reinícios do Agent

---

## 7. Critério de Aceite da Fase 3

- Handshake exige e valida token
- Copiar texto/imagem no Windows separa corretamente os arquivos por tipo
- Screenshot só ocorre mediante ação explícita do usuário
- Expurgo de 7 dias funcional e auditável via log
- Mecanismo de indexação de arquivos operacional (mesmo sem UI ainda, validável via consulta direta ao SQLite)
- Agent continua respondendo normalmente a `ping`/`pong` (não regressão do que já existe)

---

## Diretivas para Suporte de IA Local (extensão específica do Agent)

Além das diretivas gerais já definidas na Fase 2, para trabalho especificamente no Agent Python, adicione este bloco:

```
CONTEXTO ESPECÍFICO DO AGENT
- Serviço Python (FastAPI + uvicorn), rodando exclusivamente em 127.0.0.1, nunca deve
  aceitar conexões de outra origem de rede.
- Toda nova funcionalidade de longa duração (monitor de clipboard, job de expurgo,
  file watcher) deve ser implementada como task assíncrona registrada no ciclo de
  vida do FastAPI (startup event ou asyncio.create_task), NUNCA como thread solta
  sem controle de encerramento.
- Toda mensagem trocada pelo WebSocket deve respeitar o modelo AgentMessage já
  existente em protocol.py (campos "type" e "payload"). Novos tipos de mensagem
  devem ser documentados como um novo Pydantic model de payload, não como dict solto.
- Qualquer leitura de clipboard ou captura de tela deve ser escrita por trás da
  abstração de plataforma (ClipboardReader), nunca com código específico de SO
  direto dentro do loop principal ou dos handlers do FastAPI.
- PROIBIDO implementar qualquer captura de tela periódica/automática. Screenshot
  só pode ser disparado por uma mensagem explícita "screenshot:request" vinda do
  frontend. Se a tarefa pedida parecer exigir captura automática, PARAR e reportar
  ao usuário — isso contraria uma decisão de privacidade já tomada conscientemente.
- Todo arquivo escrito pelo Agent (clipboard, screenshot, índice) fica dentro de
  ~/.dashboard-agent/. Nunca escrever fora dessa pasta sem autorização explícita
  do usuário (ex: pastas indexadas, que são uma lista que o próprio usuário define).
- Ao adicionar dependências novas (pywin32, mss, watchdog, pyperclip), atualizar
  requirements.txt e mencionar explicitamente ao usuário — não assumir que ele quer
  a dependência instalada silenciosamente.
```

**Recomendação de uso:** ao pedir para uma IA local implementar, por exemplo, só a seção 3 (Clipboard), cole esse bloco geral do Agent + a seção 3 isolada deste documento, em vez do plano inteiro — mantém o contexto da IA focado e reduz risco de ela "ajudar demais" em partes que ainda não é a vez de mexer.
