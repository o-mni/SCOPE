#!/bin/bash
# SCOPE — Start both API and UI dev servers

echo ""
echo "  ╔══════════════════════════════════╗"
echo "  ║   SCOPE Local Security Platform  ║"
echo "  ║   Starting services...           ║"
echo "  ╚══════════════════════════════════╝"
echo ""

# Resolve python command (python3 on Linux, python on Windows)
if command -v python3 &>/dev/null; then
    PY=python3
    PIP=pip3
elif command -v python &>/dev/null; then
    PY=python
    PIP=pip
else
    echo "[ERROR] Python not found. Please install Python 3.9+."
    exit 1
fi

if ! command -v npm &>/dev/null; then
    echo "[ERROR] npm not found. Please install Node.js 18+."
    exit 1
fi

# Install UI deps if needed
if [ ! -d "ui/node_modules" ]; then
    echo "[UI] Installing npm dependencies..."
    (cd ui && npm install)
fi

# Install API deps if needed
if ! $PY -c "import fastapi" 2>/dev/null; then
    echo "[API] Installing Python dependencies..."
    $PIP install fastapi uvicorn sqlalchemy pydantic
fi

echo "[API] Starting FastAPI on http://localhost:8000"
echo "[UI]  Starting Vite on  http://localhost:5173"
echo ""
echo "  Open: http://localhost:5173"
echo ""

# Start API in background
(cd api && $PY -m uvicorn main:app --reload --port 8000) &
API_PID=$!

# Start UI in foreground
(cd ui && npm run dev)

# On exit, kill API
kill $API_PID 2>/dev/null
