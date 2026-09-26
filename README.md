# FEN & PGN Chess Analyzer

<div align="center">

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.110%2B-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite&logoColor=white)
![Stockfish](https://img.shields.io/badge/Engine-Stockfish-16%2B-black)

A modern, high-performance web application for analyzing chess positions and full games using the **Stockfish** engine. Built with **React 18**, **FastAPI**, **python-chess**, and **react-chessboard**.

</div>

---

## 🌟 Key Features

* ♟️ **Interactive Drag-and-Drop Board**: Move pieces directly on the board with client-side legal move validation (`chess.js`) and audio feedback via Web Audio API.
* ⚡ **Instant Stockfish Engine Analysis**: Every move triggers automatic server-side Stockfish evaluation with configurable search depth (8–24) and multi-line analysis (MultiPV 1–5).
* 🤖 **Grandmaster AI Commentary (Google Gemini)**: One-click natural language grandmaster coaching explaining why a move is best, what threats exist, and what strategic plan to follow.
* 📊 **Stockfish WDL (Win/Draw/Loss) Model**: Visual win, draw, and loss probability distribution calculated directly from engine evaluation.
* 🧠 **Tactical Explanations & Verbal Verdicts**:
  * Human-readable position assessment (*"Clear advantage for White"*, *"Decisive winning advantage"*, *"Forced mate in 3"*).
  * Tactical breakdown of the best engine move (*"Knight on f3 captures Pawn on e5 & delivers check"*).
* 📜 **PGN Game Explorer**:
  * Import and parse PGN games from **Chess.com** or **Lichess** (including thematic tournaments with custom starting FENs).
  * Step through moves with interactive buttons or **keyboard arrow keys** (`←` / `→`).
  * Convenient **Clear / Reset Game** controls to instantly clear and import new games.
  * Real-time engine evaluation and best-move arrows for every turn in the game.
* ⚖️ **Material Balance Counter**: Real-time piece material tracker with point differentials.
* 🔄 **Smart Board Controls**: Board flipping, preset historic games (e.g. Kasparov's Immortal, Fischer vs. Spassky), and a **"Play Best Move"** one-click runner.

---

## 🏗️ Architecture

```
                       ┌─────────────────────────────────────────┐
                       │        React 18 + Vite Frontend         │
                       │    (react-chessboard + chess.js)        │
                       └────────────────────┬────────────────────┘
                                            │ HTTP / JSON
                                            │ (POST /api/analyze, /api/ai-commentary)
                                            ▼
                       ┌─────────────────────────────────────────┐
                       │           FastAPI Python API            │
                       │        (Pydantic validation)            │
                       └───────────┬─────────────────┬───────────┘
                                   │ UCI             │ HTTPS / REST
                                   ▼                 ▼
             ┌───────────────────────────────┐  ┌─────────────────────────┐
             │ Stockfish Engine (C++ Binary) │  │ Google Gemini AI API    │
             │ Multithreaded evaluation & WDL│  │ Grandmaster commentary  │
             └───────────────────────────────┘  └─────────────────────────┘
```

---

## 📋 Prerequisites

Before running the application, make sure you have:

1. **Node.js** (v18 or newer) & **npm**
2. **Python** (v3.10 or newer)
3. **Stockfish Chess Engine** installed on your system PATH:
   * **macOS** (Homebrew):
     ```bash
     brew install stockfish
     ```
   * **Ubuntu / Debian**:
     ```bash
     sudo apt-get update && sudo apt-get install -y stockfish
     ```
   * **Arch Linux**:
     ```bash
     sudo pacman -S stockfish
     ```
   * **Windows**:
     Download from [stockfishchess.org/download](https://stockfishchess.org/download/) and add the binary to your system `PATH`, or set the `STOCKFISH_PATH` environment variable.

---

## 🚀 Quick Start

### 1. Clone the repository
```bash
git clone https://github.com/your-username/fen-analise.git
cd fen-analise
```

### 2. Install Dependencies

**Backend:**
```bash
pip install -r backend/requirements.txt
```

**Frontend:**
```bash
cd frontend
npm install
cd ..
```

### 3. (Optional) Configure Gemini AI Grandmaster
To enable natural language Grandmaster coaching insights, get a free API key from [Google AI Studio](https://aistudio.google.com/app/apikey) and create a `backend/.env` file:
```bash
cp backend/.env.example backend/.env
# Set GEMINI_API_KEY=AIzaSy...
```
*(You can also enter your key directly inside the web UI via the **Set API Key** button).*

### 4. Launch the Application
Run the startup script:
```bash
./start.sh
```
Or via npm:
```bash
npm run dev
```

* **Frontend Web UI**: [http://localhost:5173](http://localhost:5173)
* **Interactive API Documentation (Swagger)**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

---

## 🔌 API Reference

### `POST /api/analyze`
Analyzes a chess position given a FEN string.

**Request Payload:**
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
  "fen": "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
  "turn": "white",
  "is_check": false,
  "is_checkmate": false,
  "is_stalemate": false,
  "verbal_verdict": "Even position (balanced game)",
  "material": {
    "white": 39,
    "black": 39,
    "diff": 0
  },
  "wdl": {
    "win_pct": 7.5,
    "draw_pct": 92.1,
    "loss_pct": 0.4
  },
  "stats": {
    "depth": 16,
    "nodes": 45812,
    "nps": 650000,
    "time_seconds": 0.071
  },
  "lines": [
    {
      "rank": 1,
      "move_uci": "d2d4",
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
Generates natural language grandmaster commentary using Google Gemini 3.8 Flash.

**Request Payload:**
```json
{
  "fen": "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
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
  "commentary": "White strikes in the center with 3. d4, opening lines for the bishops and challenging Black's central pawn immediately. Black must decide how to resolve the tension, while White aims for rapid piece activation and king safety.",
  "model": "gemini-3.8-flash"
}
```

### `GET /api/health`
Checks backend engine health, Stockfish binary availability, and Gemini API key status.

---

## 📁 Project Structure

```text
FenAnalise/
├── backend/
│   ├── main.py              # FastAPI service with Stockfish UCI engine integration
│   └── requirements.txt     # Python dependencies & engine setup notes
├── frontend/                # React 18 + Vite Single Page Application
│   ├── src/
│   │   ├── api/
│   │   │   └── chessApi.js         # API client connecting frontend to FastAPI
│   │   ├── components/
│   │   │   ├── BoardView.jsx       # Interactive chessboard with drag-and-drop & best-move arrow
│   │   │   ├── FenInput.jsx        # FEN input, presets, and analysis settings
│   │   │   ├── AnalysisPanel.jsx   # Evaluation score, WDL bar, tactics & MultiPV lines
│   │   │   └── PgnViewer.jsx       # PGN game parser and move-by-move explorer
│   │   ├── utils/
│   │   │   └── sound.js            # Synthesized Web Audio sound effects (moves/captures)
│   │   ├── App.jsx                 # Top-level state orchestrator
│   │   ├── index.css               # Modern dark-mode chess UI stylesheet
│   │   └── main.jsx                # React DOM entry point
│   ├── package.json
│   └── vite.config.js              # Reverse proxy configuration (/api -> :8000)
├── start.sh                        # One-command dual-process runner
├── package.json                    # Root npm scripts runner
└── README.md
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
