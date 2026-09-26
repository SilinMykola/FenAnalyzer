#!/bin/bash

# Terminate background processes when Ctrl+C is pressed
trap "kill 0" EXIT

echo "=========================================="
echo "♟️  Starting FEN Chess Analyzer"
echo "=========================================="

# 1. Check Python dependencies
echo "🐍 Starting FastAPI Backend on http://127.0.0.1:8000..."
python3 -m uvicorn backend.main:app --reload --port 8000 &
BACKEND_PID=$!

# Wait a brief moment for backend to initialize
sleep 1

# 2. Start Vite Frontend
echo "⚛️  Starting Vite React Frontend on http://localhost:5173..."
cd frontend && npm run dev &
FRONTEND_PID=$!

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID
