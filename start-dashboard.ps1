# Inicia o agente local (se instalado) e o frontend do dashboard.
# Ao encerrar o frontend (Ctrl+C), o agente iniciado por este script tambem e encerrado.
$root = $PSScriptRoot
$agentPython = Join-Path $root "agent/.venv/Scripts/python.exe"
$agentProcess = $null

if (Test-Path $agentPython) {
    $agentRunning = Get-NetTCPConnection -LocalPort 5137 -State Listen -ErrorAction SilentlyContinue
    if ($agentRunning) {
        Write-Host "Agente ja em execucao na porta 5137."
    } else {
        $agentProcess = Start-Process -FilePath $agentPython -ArgumentList "-m", "src.main" `
            -WorkingDirectory (Join-Path $root "agent") -WindowStyle Minimized -PassThru
        Write-Host "Agente iniciado (PID $($agentProcess.Id))."
    }
} else {
    Write-Warning "agent/.venv nao encontrado: iniciando somente o frontend. Veja o README para instalar o agente."
}

try {
    Set-Location "$root/app"
    if (-not (Test-Path node_modules)) {
        npm install
    }
    npm run dev -- --host 0.0.0.0 --port 3000
} finally {
    if ($agentProcess -and -not $agentProcess.HasExited) {
        Stop-Process -Id $agentProcess.Id
        Write-Host "Agente encerrado."
    }
}
