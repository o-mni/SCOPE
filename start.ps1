Write-Host ""
Write-Host "  ╔══════════════════════════════════╗"
Write-Host "  ║   SCOPE Local Security Platform  ║"
Write-Host "  ║   Starting services...           ║"
Write-Host "  ╚══════════════════════════════════╝"
Write-Host ""

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

# Install UI deps if needed
if (-not (Test-Path "$Root\ui\node_modules")) {
    Write-Host "[UI] Installing npm dependencies..."
    Push-Location "$Root\ui"
    npm install
    Pop-Location
}

# Install API deps if needed
$hasFastapi = python -c "import fastapi" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[API] Installing Python dependencies..."
    pip install fastapi uvicorn sqlalchemy pydantic
}

Write-Host "[API] Starting FastAPI on http://localhost:8000"
Write-Host "[UI]  Starting Vite on  http://localhost:5173"
Write-Host ""
Write-Host "  Open: http://localhost:5173"
Write-Host ""

# Start API in a new window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$Root\api'; python -m uvicorn main:app --reload --port 8000"

# Start UI in current window
Set-Location "$Root\ui"
npm run dev
