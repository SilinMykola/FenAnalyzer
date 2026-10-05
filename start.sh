#!/bin/bash

# Terminate all background processes when Ctrl+C is pressed
trap "kill 0" EXIT

echo "=========================================="
echo "♟️  FenAnalyzer — Chess Analysis Suite"
echo "=========================================="

# ── 1. Check uv (Python package manager) ──────────────────────────────────────
if ! command -v uv &> /dev/null; then
  echo "📦 uv not found. Installing via Homebrew..."
  if command -v brew &> /dev/null; then
    brew install uv
  else
    echo "   Homebrew not found. Installing uv via official installer..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    # Add uv to PATH for this session
    export PATH="$HOME/.local/bin:$PATH"
  fi
fi

# ── 2. Install / sync Python dependencies via uv ──────────────────────────────
echo "🐍 Checking Python dependencies..."
if ! uv pip show fastapi &> /dev/null 2>&1; then
  echo "   Installing Python packages with uv..."
  uv pip install -r backend/requirements.txt
else
  echo "   Python dependencies already installed ✓"
fi

# ── 3. Install Node / npm dependencies ────────────────────────────────────────
echo "⚛️  Checking Node dependencies..."
if [ ! -d "frontend/node_modules" ]; then
  echo "   Installing npm packages..."
  cd frontend && npm install && cd ..
else
  echo "   Node dependencies already installed ✓"
fi

# ── 4. Start FastAPI Backend ───────────────────────────────────────────────────
echo ""
echo "🚀 Starting FastAPI Backend  →  http://127.0.0.1:8000"
python3 -m uvicorn backend.main:app --reload --port 8000 &
BACKEND_PID=$!

sleep 1

# ── 5. Start Vite Frontend ────────────────────────────────────────────────────
echo "🎨 Starting Vite Frontend    →  http://localhost:5173"
cd frontend && npm run dev &
FRONTEND_PID=$!

echo ""
echo "=========================================="
echo "✅  Both services are running."
echo "   Frontend : http://localhost:5173"
echo "   API Docs : http://localhost:8000/docs"
echo "   Press Ctrl+C to stop."
echo "=========================================="

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID
