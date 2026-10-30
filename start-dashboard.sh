#!/usr/bin/env bash
# Inicia o agente local (se instalado) e o frontend do dashboard.
# Ao encerrar o frontend (Ctrl+C), o agente iniciado por este script também é encerrado.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_PYTHON="$ROOT/agent/.venv/bin/python"
AGENT_LOG="$ROOT/agent/agent.log"
AGENT_PID=""

cleanup() {
  if [[ -n "$AGENT_PID" ]] && kill -0 "$AGENT_PID" 2>/dev/null; then
    kill "$AGENT_PID"
    echo "Agente encerrado."
  fi
}
trap cleanup EXIT

if [[ -x "$AGENT_PYTHON" ]]; then
  if (exec 3<>/dev/tcp/127.0.0.1/5137) 2>/dev/null; then
    echo "Agente já em execução na porta 5137."
  else
    (cd "$ROOT/agent" && exec "$AGENT_PYTHON" -m src.main) >"$AGENT_LOG" 2>&1 &
    AGENT_PID=$!
    echo "Agente iniciado (PID $AGENT_PID). Log: $AGENT_LOG"
  fi
else
  echo "Aviso: agent/.venv não encontrado; iniciando somente o frontend. Veja o README para instalar o agente." >&2
fi

cd "$ROOT/app"
if [[ ! -d node_modules ]]; then
  npm install
fi
npm run dev -- --host 0.0.0.0 --port 3000
