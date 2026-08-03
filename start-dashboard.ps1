Set-Location "$PSScriptRoot/app"
if (-not (Test-Path node_modules)) {
    npm install
}
npm run dev -- --host 0.0.0.0 --port 3000
