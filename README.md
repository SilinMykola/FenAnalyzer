# ♟️ FenAnalyzer

<div align="center">

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.110%2B-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite&logoColor=white)
![Stockfish](https://img.shields.io/badge/Engine-Stockfish%2016%2B-2b2b2b?logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+PHRleHQgeT0iMjQiIGZvbnQtc2l6ZT0iMjQiPuKZn++4jzwvdGV4dD48L3N2Zz4=&logoColor=white)
![Gemini](https://img.shields.io/badge/AI-Gemini%203.8%20Flash-4285F4?logo=google&logoColor=white)

**A full-stack chess analysis web app powered by Stockfish 16 and Google Gemini AI.**  
Load any FEN or PGN, explore engine variations interactively, build custom positions,
and get natural language grandmaster coaching — all in a modern dark-mode UI.

</div>

---

## 🌟 Features

### 🔍 Analysis Engine
- **Instant Stockfish Evaluation** — every move triggers server-side UCI engine analysis with configurable depth (1–30) and MultiPV lines (1–5)
- **Clickable Engine Variations** — each move in the top engine lines is an interactive badge; click any move to preview that position on the board instantly, then return to the original with one click
- **WDL Probability Bar** — visual Win / Draw / Loss percentage breakdown from the Stockfish internal model
- **Material Balance Counter** — real-time piece count with point differentials (e.g. `+2 White`)
- **Verbal Verdicts** — human-readable position assessments: *"Decisive advantage for White"*, *"Forced mate in 3"*, *"Even position"*
- **Tactical Explanations** — plain-English move descriptions: *"Knight captures Pawn on e5 & delivers check"*

### 🤖 Grandmaster AI Commentary (Google Gemini)
- One-click **natural language coaching** from Google Gemini 3.8 Flash
- Explains *why* the best engine move is strongest, outlines the strategic plan, and highlights key threats
- **Retry logic** with exponential backoff for 503/429 rate-limit errors
- API key configurable via `backend/.env` or directly in the UI — no backend restart needed

### 📋 PGN Game Explorer
- Import and parse games from **Chess.com** or **Lichess** (including custom starting FEN tournaments)
- **Chess.com-style scoresheet table** — moves displayed in a 3-column table (`#` / `⚪ White` / `⚫ Black`) with sticky header
- **Active move highlighted** with a blue background and glow ring; table **auto-scrolls** to keep the current move in view
- **Game metadata** — displays player names, ELO ratings, event name, date, and color-coded result badge (`1–0` / `0–1` / `½–½`)
- Navigate moves with **⏮ ◀ ▶ ⏭ buttons** or **keyboard arrow keys** (`←` / `→`)
- Real-time Stockfish evaluation and best-move arrows on every step
- Clear / Reset controls to instantly load a new game

### 🧩 Board Editor
- Dedicated **Board Editor tab** for building any custom chess position from scratch
- **Piece palette** — click to select White ♔♕♖♗♘♙ or Black ♚♛♜♝♞♟ pieces, then place them on any square
- **Eraser tool** — click squares to remove individual pieces
- **Drag & drop** — rearrange existing pieces freely on the board
- **Castling rights toggles** — set White/Black kingside and queenside castling availability
- **Turn selector** — choose White or Black to move
- **Live FEN output** — generated FEN updates in real-time as you edit; copy to clipboard with one click
- **Position validation** — warns if kings are missing; "Analyze" button disabled until position is legal
- **Send to Stockfish** — instantly pass the custom position to the engine with one button

### 🎮 Interactive Board (FEN Mode)
- **Drag-and-drop** piece movement with client-side legal move validation (`chess.js`)
- **Audio feedback** — synthesized move and capture sounds via Web Audio API (no external files)
- **Best-move arrow** — visual arrow overlay highlighting the engine's top recommendation
- **Board flip** — toggle perspective between White and Black
- **FEN paste / clear** — load any position directly from a FEN string
- **Preset positions** — one-click historic games (Kasparov's Immortal, Fischer vs. Spassky, and more)
- **Play Best Move** — apply the engine's top recommendation with a single button

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│         React 18 + Vite  (localhost:5173)        │
│   react-chessboard · chess.js · Web Audio API   │
└────────────────────────┬────────────────────────┘
                         │  HTTP / JSON (Vite proxy)
                         │  POST /api/analyze
                         │  POST /api/ai-commentary
                         │  GET  /api/health
                         ▼
┌─────────────────────────────────────────────────┐
│       FastAPI Python Backend  (localhost:8000)   │
│         python-chess · Pydantic · httpx          │
└────────────────┬────────────────────────────────┘
                 │ UCI protocol        │ HTTPS REST
                 ▼                    ▼
  ┌──────────────────────┐  ┌──────────────────────┐
  │  Stockfish 16+ (C++) │  │  Google Gemini API   │
  │  Multi-threaded eval │  │  Grandmaster coaching│
  │  WDL · MultiPV · NPS │  │  gemini-3.8-flash    │
  └──────────────────────┘  └──────────────────────┘
```

---

## 📋 Prerequisites

| Requirement | Version | Install |
|---|---|---|
| Node.js + npm | v18+ | [nodejs.org](https://nodejs.org) |
| Python | v3.10+ | [python.org](https://python.org) |
| uv *(Python pkg manager)* | latest | `brew install uv` or [astral.sh/uv](https://astral.sh/uv) |
| Stockfish | 16+ | See below |

> **`uv`** is a fast Rust-based Python package manager — a drop-in replacement for `pip`, 10–100× faster. `start.sh` will install it automatically if it's missing.

**Install Stockfish:**

```bash
# macOS (Homebrew)
brew install stockfish

# Ubuntu / Debian
sudo apt-get install -y stockfish

# Arch Linux
sudo pacman -S stockfish

# Windows — download from stockfishchess.org/download and add to PATH
```

---

## 🚀 Quick Start

### 1. Clone the repository
```bash
git clone https://github.com/SilinMykola/FenAnalyzer.git
cd FenAnalyzer
```

### 2. Install Stockfish
```bash
# macOS
brew install stockfish

# Ubuntu / Debian
sudo apt-get install -y stockfish
```

### 3. Configure Gemini AI (optional)
Get a free API key at [Google AI Studio](https://aistudio.google.com/app/apikey) and create `backend/.env`:

```bash
cp backend/.env.example backend/.env
# Edit backend/.env:
# GEMINI_API_KEY=AIzaSy...
```

> You can also enter the key directly in the web UI via the **⚙️ Set API Key** button — no restart needed.

### 4. Start the application

#### ⚡ Option A — One command (recommended)
`start.sh` automatically checks and installs all missing dependencies before launching:

```bash
chmod +x start.sh
./start.sh
```

On first run it will:
- Install **uv** (Python package manager) if missing — via Homebrew or the official installer
- Install Python packages (`fastapi`, `uvicorn`, `python-chess`, `httpx`, etc.) with `uv`
- Install Node packages (`react`, `vite`, `chess.js`, etc.) if `node_modules` is missing
- Start both backend and frontend

#### 🔧 Option B — Manual install
```bash
# Python dependencies (uv — fast Rust-based pip replacement)
brew install uv          # or: curl -LsSf https://astral.sh/uv/install.sh | sh
uv pip install -r backend/requirements.txt

# Node dependencies
cd frontend && npm install && cd ..

# Launch
npm run dev
```

| Service | URL |
|---|---|
| **Web UI** | http://localhost:5173 |
| **API Docs (Swagger)** | http://localhost:8000/docs |
| **Health Check** | http://localhost:8000/api/health |

---

## 🔌 API Reference

### `POST /api/analyze`
Analyzes a chess position with Stockfish.

**Request:**
```json
{
  "fen": "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
  "depth": 16,
  "multipv": 3
}
```

**Response:**
```json
{
  "fen": "...",
  "turn": "white",
  "is_check": false,
  "is_checkmate": false,
  "is_stalemate": false,
  "verbal_verdict": "Even position (balanced game)",
  "material": { "white": 39, "black": 39, "diff": 0 },
  "wdl": { "win_pct": 7.5, "draw_pct": 92.1, "loss_pct": 0.4 },
  "stats": { "depth": 16, "nodes": 45812, "nps": 650000, "time_seconds": 0.071 },
  "lines": [
    {
      "rank": 1,
      "move_san": "d4",
      "score": "+0.37",
      "explanation": "Pawn moves to d4",
      "pv_san": ["d4", "exd4", "Nxd4", "Nf6", "Nc3", "Bb4"],
      "pv_uci": ["d2d4", "e5d4", "f3d4", "g8f6", "b1c3", "f8b4"]
    }
  ]
}
```

### `POST /api/ai-commentary`
Generates grandmaster coaching commentary via Google Gemini.

**Request:**
```json
{
  "fen": "...",
  "turn": "white",
  "score": "+0.37",
  "best_move_san": "d4",
  "explanation": "Pawn moves to d4",
  "verbal_verdict": "Even position (balanced game)"
}
```

**Response:**
```json
{
  "success": true,
  "commentary": "White strikes in the center with 3. d4, opening lines for the bishops...",
  "model": "gemini-3.8-flash"
}
```

### `GET /api/health`
Returns engine availability and API key configuration status.

---

## 📁 Project Structure

```
FenAnalyzer/
├── backend/
│   ├── main.py               # FastAPI · Stockfish UCI · Gemini AI · Pydantic models
│   ├── requirements.txt      # Python dependencies
│   └── .env.example          # Environment variable template
├── frontend/
│   └── src/
│       ├── api/
│       │   └── chessApi.js         # API client (fetch wrapper for all endpoints)
│       ├── components/
│       │   ├── BoardView.jsx       # Interactive board · drag-drop · best-move arrow
│       │   ├── BoardEditor.jsx     # Custom position builder · piece palette · FEN export
│       │   ├── FenInput.jsx        # FEN input · presets · depth & MultiPV controls
│       │   ├── AnalysisPanel.jsx   # Evaluation · WDL bar · MultiPV lines · Gemini AI
│       │   └── PgnViewer.jsx       # PGN import · move-by-move navigation · keyboard support
│       ├── utils/
│       │   └── sound.js            # Synthesized Web Audio sound effects
│       ├── App.jsx                 # Top-level state orchestrator
│       ├── index.css               # Dark-mode design system & component styles
│       └── main.jsx                # React DOM entry point
├── start.sh                        # One-command launcher (backend + frontend)
├── package.json                    # Root npm scripts
└── README.md
```

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|---|---|
| `←` | Previous move (PGN mode) |
| `→` | Next move (PGN mode) |

---

## 🛠️ Environment Variables

| Variable | Default | Description |
|---|---|---|
| `GEMINI_API_KEY` | — | Google Gemini API key for AI commentary |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Gemini model name |
| `STOCKFISH_PATH` | auto-detect | Override Stockfish binary path |

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
