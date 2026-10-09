#!/usr/bin/env bash

# ==============================================================================
# Lithium Supply Chain Navigator - Full Stack Development Server Runner
# Backend (Port 3001) & Frontend (Port 3000)
# ==============================================================================

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "[INFO] Starting backend and frontend development servers..."
echo "[INFO] Project Root: $ROOT_DIR"

cleanup() {
    echo ""
    echo "[INFO] Shutting down all development servers..."
    kill $(jobs -p) 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# 1. Backend Server (tsx --watch)
echo "[INFO] Starting Backend Server on http://localhost:3001..."
npm --workspace=@navigator/backend run dev &
BACKEND_PID=$!

sleep 1.5

# 2. Frontend Server (Vite)
echo "[INFO] Starting Frontend Server on http://localhost:3000..."
npm --workspace=@navigator/frontend run dev &
FRONTEND_PID=$!

echo ""
echo "[INFO] Both servers are running."
echo "[INFO] Frontend URL: http://localhost:3000"
echo "[INFO] Press Ctrl+C to stop all servers."
echo "------------------------------------------------------------------"

wait
