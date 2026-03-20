#!/bin/bash
# SCOPE — Single-command launcher (Linux only)
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$SCRIPT_DIR/api/.venv"

echo ""
echo "  ╔══════════════════════════════════╗"
echo "  ║   SCOPE Local Security Platform  ║"
echo "  ╚══════════════════════════════════╝"
echo ""

# ── Python ────────────────────────────────────────────────────────────────────
if ! command -v python3 &>/dev/null; then
    echo "[ERROR] python3 not found. Install Python 3.11+."
    exit 1
fi

# ── Node / npm ────────────────────────────────────────────────────────────────
if ! command -v npm &>/dev/null; then
    echo "[ERROR] npm not found."
    echo "        Install with: sudo pacman -S nodejs npm"
    exit 1
fi

# ── Python venv + deps ────────────────────────────────────────────────────────
if [ ! -d "$VENV" ]; then
    echo "[API] Creating Python virtual environment..."
    python3 -m venv "$VENV"
fi

# Activate venv
source "$VENV/bin/activate"

if ! python3 -c "import fastapi" 2>/dev/null; then
    echo "[API] Installing Python dependencies..."
    python3 -m pip install --quiet fastapi "uvicorn[standard]" sqlalchemy pydantic
fi

# ── UI deps ───────────────────────────────────────────────────────────────────
if [ ! -d "$SCRIPT_DIR/ui/node_modules" ]; then
    echo "[UI]  Installing npm dependencies..."
    (cd "$SCRIPT_DIR/ui" && npm install --silent)
fi

# Ensure vite is executable (can lose +x after git operations)
chmod +x "$SCRIPT_DIR/ui/node_modules/.bin/"* 2>/dev/null || true

# ── Launch ────────────────────────────────────────────────────────────────────
echo "[API] Starting FastAPI  →  http://localhost:8000"
echo "[UI]  Starting Vite     →  http://localhost:5173"
echo ""
echo "  Open: http://localhost:5173"
echo ""

# Trap Ctrl-C to kill both servers cleanly
cleanup() {
    echo ""
    echo "  Stopping SCOPE..."
    kill "$API_PID" 2>/dev/null
    exit 0
}
trap cleanup INT TERM

(cd "$SCRIPT_DIR/api" && python3 -m uvicorn main:app --reload --port 8000 --log-level warning) &
API_PID=$!

(cd "$SCRIPT_DIR/ui" && npm run dev --silent)

kill "$API_PID" 2>/dev/null
