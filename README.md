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
Load any FEN or PGN — or just a screenshot of a board — explore engine variations
interactively, build custom positions, and get natural language grandmaster coaching — all in a modern UI with dark and light themes.

</div>

---

## 🌟 Features

### 🔍 Analysis Engine
- **Instant Stockfish Evaluation** — every move triggers server-side UCI engine analysis with configurable depth (1–30, 20 by default) and MultiPV lines (1–5)
- **Depth and lines on every tab** — the **Stockfish** bar with the Depth (10–30, the default 20 in the middle) and Lines sliders sits above the FEN, PGN and Board Editor tabs alike. Moving a slider sends nothing to Stockfish; a **✓ Apply** button appears and analyzes the position on the board with the new values (the game position shown on the PGN tab), which then stay for the positions analyzed next. In the Board Editor, Apply keeps them for **Analyze this Setup**
- **Depth 20 by default** — at depth 16 Stockfish still falls for some tactics: in `r7/pp4kp/2p2qp1/4n3/N5Q1/7P/PPP3P1/3R2K1 w - - 3 25` it ranked Qd7+ first at +0.34, though Nxd7 simply wins the queen (−8.94). From depth 18 on it plays Qd4. Depth 20 takes a few seconds per position; lower it with the slider for faster answers
- **Clickable Engine Variations** — each move in the top engine lines is an interactive badge; click any move to preview that position on the board instantly, then return to the original with one click. A preview ends by itself as soon as another position comes to the board: a loaded PGN, a step through the game, a move, a FEN, an image or the Board Editor
- **WDL Probability Bar** — visual Win / Draw / Loss percentage breakdown from the Stockfish internal model
- **Material Balance Counter** — real-time piece count with point differentials (e.g. `+2 White`)
- **Verbal Verdicts** — human-readable position assessments: *"Decisive advantage for White"*, *"Forced mate in 3"*, *"Even position"*
- **Tactical Explanations** — plain-English move descriptions: *"Knight captures Pawn on e5 & delivers check"*

### 🌐 Languages
- The interface speaks **English, German, Russian and Ukrainian**; pick one in the **🌐** list in the header. The first visit opens in the browser's language when it is one of these four, otherwise in English, and the choice is remembered in the browser
- **Gemini answers in the chosen language** — the Grandmaster commentary and the **💡 Why?** explanation; moves and squares stay in standard algebraic notation (`e4`, `Nf3`)
- What comes from the backend stays in English: Stockfish's verdicts and move explanations (*"Even position"*, *"Queen moves to d4"*) and the error messages of the server and of Gemini
- The texts live in `frontend/src/i18n/messages/`, one file per part of the app with all four languages side by side; a test checks that every text exists in every language with the same placeholders

### 🤖 Grandmaster AI Commentary (Google Gemini)
- One-click **natural language coaching** from Google Gemini 3.8 Flash
- Explains *why* the best engine move is strongest, outlines the strategic plan, and highlights key threats
- **💡 Why?** under the score asks a different question: *why* Stockfish rates the position as it does — material, threats, king safety, piece activity, pawn structure. Stockfish's top lines and the material count go along with the question, so the explanation rests on the engine's variations instead of guesses. The answer appears under the score and is dropped when the position changes; the button shares the model choice and the pause with the other Gemini requests
- **Room to answer** — newer Gemini models think before they answer and that thinking counts against the output limit, so the limit is generous (8192 tokens) and the commentary may take up to a minute. If an answer still hits the limit, it ends with a note that it was cut off instead of stopping mid-sentence without a word
- **Retry logic** with exponential backoff for 503 (overloaded) and 429 (rate limit) errors; when all three tries fail, the error says which of the two it was and passes on Google's own message — for a used-up quota that usually includes how long to wait
- **Model picker** — the **🤖 Gemini** list in the header shows every model your API key can use (fetched from Google) and picks the one for both the commentary and reading images. The choice is remembered in the browser. The default is the server's model: `gemini-3.8-flash`, or `GEMINI_MODEL` from `backend/.env`
- **Pause after a refusal** — when Gemini is overloaded or the quota is used up, **Ask Grandmaster** and the image box's **Try Again** are locked and show a countdown (`⏳ Ask again in 0:44`), then unlock by themselves. The wait is the one Google names (*"Please retry in 12h21m44s"*), or 30 s for an overload and 60 s for a rate limit when it names none. Each model has its own quota and its own pause, so choosing another model lifts the lock at once — the same model list is right at hand: the Grandmaster block always shows it under its title, and the image box always shows it too, under its buttons, so the model can be chosen before the first read and changed for another try. The lists stay in place while the countdown ticks, so an open list is not closed under your cursor. All the lists show and change one shared choice. A running pause survives a page reload
- When Google names a wait, the backend does not retry before it ends: that would only be refused again
- API key configurable via `backend/.env` or directly in the UI — no backend restart needed

### 📋 PGN Game Explorer
- Import and parse games from **Chess.com** or **Lichess** (including custom starting FEN tournaments)
- Once loaded, the board shows the final position with the side to move at the bottom
- **Chess960 games** from Chess.com load completely, castling included: chess.js in the browser knows no Chess960, so a PGN tagged `[Variant "Chess960"]` is replayed by the backend with python-chess. Castling rights stay written as rook files (`DAda`), as Chess.com writes them, and every position is analyzed in Chess960 mode, so Stockfish's lines include Chess960 castling. Moves dragged on the board in such a position work, except castling itself, and they drop the castling rights from then on
- **Chess.com-style scoresheet table** — moves displayed in a 3-column table (`#` / `⚪ White` / `⚫ Black`) with sticky header
- **Active move highlighted** with a blue background and glow ring; table **auto-scrolls** to keep the current move in view
- **Game metadata** — displays player names, ELO ratings, event name, date, and color-coded result badge (`1–0` / `0–1` / `½–½`)
- Navigate moves with **⏮ ◀ ▶ ⏭ buttons** or **keyboard arrow keys** (`←` / `→`)
- Real-time Stockfish evaluation and best-move arrows on every step
- Clear / Reset controls to instantly load a new game

### 📷 Position from Image
- **Analyze a picture of a board** — a screenshot from Chess.com or Lichess, a book diagram or a photo
- Three ways in, right under the FEN input: **paste with `Ctrl+V` / `⌘V`** anywhere on the FEN tab, the **Paste Image** button, or **Upload File** (drag & drop works too)
- Google Gemini reads the pieces; the backend checks the result with python-chess, so a garbled answer is never put on the board
- The recognized position appears on the board and in the FEN box and is **analyzed by Stockfish straight away**, with the side to move at the bottom
- **Side to move** is taken from the image when it shows it (a caption, a highlighted last move); otherwise White is assumed — or Black, when only that is legal — and the UI says it is a guess
- **Castling rights** are granted wherever king and rook stand on their home squares
- A misread piece can make the position illegal: it is then shown on a locked board, without analysis, with a **Fix in Board Editor** button
- **Try Again** — when reading the image fails (Gemini overloaded, a timeout, a network error), one click sends the same picture again, no need to paste it anew. After an overload or a used-up quota the button waits out Gemini's pause with a countdown next to it, ; the model list in the image box lets you switch to another model and send the image again at once
- **Boards seen from Black's side** — Gemini copies the board exactly as the picture shows it and names the corner square from the coordinate labels (`a1` or `h8` bottom-left); turning a board seen from Black's side is done by the backend, not by the model, which used to get it wrong. The result then notes *"The picture shows the board from Black's side; it was turned to White's."*
- **↻ Upside down? Turn 180°** — if a position still comes out upside down (kings far from home, pawns about to promote on both sides), one click under the result turns it by 180 degrees; a second click turns it back. Keep the coordinate labels in the picture: they tell which way round the board is
- **Read Again** — a result can be a misread too: after any result the same picture can be sent again, e.g. to a stronger model chosen in the image box, without pasting it anew
- **The model choice is remembered** in the browser and stays after a successful read and a page reload; the header, the image box and the Grandmaster block all show and change the same choice
- **Clear Image** removes the pasted picture together with its error or result; the board stays as it is
- PNG, JPEG or WebP up to 10 MB; needs a Gemini API key (the same one as the commentary)
- **📍 Local reader — no Gemini, no quota, no internet.** Choose **📍 Local (calibrated board)** in the image box's model list. The first time, paste a screenshot of the **starting position** from the site your screenshots come from (either side at the bottom): the reader cuts the 12 pieces and the two square colours out of it and checks that they read back as the starting position. From then on every screenshot in that style is read on your own computer in under a second, with the same answer every time. Square by square, the piece is told apart from the square by colour and compared with the calibrated pieces, so the highlighted last move does not get in the way — it tells whose move it is: the side that did not just move. The rank numbers beside the board tell whether it is seen from Black's side; without them the pawns do. A square that matches no piece clearly is named in the error (*"Could not tell which piece stands on d5"*) instead of being guessed. **🎯 Recalibrate** takes a new starting position, e.g. after changing the board theme on the site; a failed calibration keeps the old one. The calibration is kept in `backend/calibration/` (not in git)

### 🧩 Board Editor
- Dedicated **Board Editor tab** for building any custom chess position from scratch
- **Piece palette** — click to select White ♔♕♖♗♘♙ or Black ♚♛♜♝♞♟ pieces, then place them on any square; large buttons with the colour label and all tools on a single row
- **Build from an empty board** — clear the board and place pieces one by one; placing a king moves that side's existing king, so each side always has at most one
- **Click again to take it away** — with a piece selected, clicking a square that already holds that same piece removes it: the first click puts a white knight down, the second takes it off. A piece of another kind or colour is replaced as before
- **Eraser tool** — available in both palettes; click squares to remove individual pieces (a click with no tool selected removes a piece too)
- **Drag & drop** — rearrange existing pieces freely on the board
- **Flip Board** — turn the board over; the palettes swap with it so each colour stays next to its own side
- **Castling rights toggles** — set White/Black kingside and queenside castling availability; a right is disabled while its king and rook are off their starting squares, so the FEN never claims an impossible castle
- **Turn selector** — choose White or Black to move
- **Live FEN output** — generated FEN updates in real-time as you edit; copy to clipboard with one click; type or paste a FEN into the box to load it onto the board
- **Position validation** — tells you what to fix before analysis: missing kings, too many kings, pawns on the first or last rank, or the side not to move being in check; "Analyze" stays disabled until the position is legal
- **Send to Stockfish** — instantly pass the custom position to the engine with one button; it opens on the analysis board with the side to move at the bottom, ready to be played on

### 🌗 Dark & Light Themes
- **Theme toggle** (☀️ / 🌙) in the header next to the Stockfish status switches the whole site
- The choice is remembered in the browser; on a first visit the theme follows the operating system setting
- Built on CSS custom properties: every colour in `index.css` is a theme token, redefined under `[data-theme='light']`

### 🎮 Interactive Board (FEN Mode)
- **Drag-and-drop** piece movement with client-side legal move validation (`chess.js`)
- **Audio feedback** — synthesized move and capture sounds via Web Audio API (no external files)
- **Pawn promotion** — a pawn reaching the last rank opens a dialog to choose a queen, rook, bishop or knight, and the chosen piece is played
- **Best-move arrow** — visual arrow overlay highlighting the engine's top recommendation. The arrow and the engine lines always belong to the position on the board: when you move on before an analysis is done, its late answer is dropped instead of replacing the newer one
- **Side to move at the bottom** — loading a position from a FEN, a PGN, an image or the Board Editor turns the board so the side to move plays from below; moves played afterwards and stepping through a game leave it as it is, and **Reset Board** puts White back at the bottom
- **Board flip** — toggle perspective between White and Black at any time
- **FEN paste / clear** — load any position directly from a FEN string
- **Preset positions** — one-click historic games (Kasparov's Immortal, Fischer vs. Spassky, and more)
- **Play Best Move** — apply the engine's top recommendation with a single button
- **Your moves** — once you play a move on a loaded position (from a FEN, an image, the Board Editor or a PGN), a strip above the board lists your moves in scoresheet style (`19… Kh8 · 20. h3`) together with the FEN you started from. Click any move, or use **⏮ ◀ ▶ ⏭** or the **← / →** keys on the FEN tab, to step through them; **Start** / ⏮ takes you back to the loaded position, and each position is analyzed again. Playing a move from an earlier position starts a new branch and replaces the old continuation. Moves of an engine line played with **Play from here** and **Play Best Move** are listed too. Loading another position or **Reset Board** starts a new list
- **Reset Board** — puts the starting position back on the board and empties the FEN box, ready for the next FEN

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│         React 18 + Vite  (dev server)            │
│   react-chessboard · chess.js · Web Audio API   │
└────────────────────────┬────────────────────────┘
                         │  HTTP / JSON (Vite proxy)
                         │  POST /api/analyze
                         │  POST /api/ai-commentary
                         │  POST /api/recognize-image
                         │  GET  /api/local-reader
                         │  POST /api/local-reader/calibrate
                         │  POST /api/gemini-models
                         │  POST /api/parse-pgn
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
| **Web UI** | http://localhost:5180 (port set in `frontend/vite.config.js`) |
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
  "depth": 20,
  "multipv": 3,
  "chess960": false
}
```
`chess960` (optional) analyzes the position as Chess960, so Stockfish plays Chess960 castling. A FEN
whose castling field names rook files (`DAda`) is read as Chess960 without it.

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
  "stats": { "depth": 20, "nodes": 45812, "nps": 650000, "time_seconds": 0.071 },
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
  "verbal_verdict": "Even position (balanced game)",
  "model": "gemini-2.5-flash-lite",
  "focus": "evaluation",
  "lines": [{ "score": "+0.37", "pv_san": ["d4", "Nf6", "c4"] }],
  "language": "uk"
}
```
`focus` is `"move"` (the default: why the best move is best) or `"evaluation"` (why the position
is rated so); `lines` are Stockfish's top lines, up to 5, sent along as evidence for an evaluation.
`language` is the language Gemini writes in: `en` (the default), `de`, `ru` or `uk`; any other is
rejected with `422`.
`model` is optional; without it the server's default model is asked. Only plain model names
(lowercase letters, digits, `.` and `-`) are accepted, anything else is rejected with `422`.

**Response:**
```json
{
  "success": true,
  "commentary": "White strikes in the center with 3. d4, opening lines for the bishops...",
  "model": "gemini-3.8-flash",
  "error": null,
  "retry_after_seconds": null
}
```
When Gemini is overloaded (503) or refuses for rate limit or quota (429), `success` is `false`,
`error` says which it was and ends with Google's own message, and `retry_after_seconds` says how
long to wait before asking this model again.

### `POST /api/recognize-image`
Reads a chess position from an image via Google Gemini and returns it as FEN.

**Request:**
```json
{
  "image_base64": "iVBORw0KGgoAAAANSUhEUgAA...",
  "mime_type": "image/png",
  "model": "gemini-2.5-flash-lite"
}
```
`image_base64` may also be a whole `data:image/png;base64,...` URL. Accepted types: PNG, JPEG, WebP
(and HEIC/HEIF); at most 10 MB. A bad image is rejected with `400`, `413` or `415`.

**Response:**
```json
{
  "success": true,
  "fen": "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1",
  "turn_detected": false,
  "is_valid": true,
  "seen_from_black": false,
  "model": "gemini-3.8-flash",
  "error": null,
  "retry_after_seconds": null
}
```
`model` and `retry_after_seconds` work as in `/api/ai-commentary`.
`seen_from_black` tells that the picture showed the board from Black's side and the backend turned it.
`turn_detected` tells whether the side to move came from the image or was assumed.
`is_valid: false` means the position is illegal (e.g. a missing king) and Stockfish would reject it.
When nothing could be read, `success` is `false` and `error` says why.

With `"reader": "local"` the image is read on this machine against the calibrated board instead
of by Gemini; `model` is then `"local"`, and the key and model fields are not needed.

### `GET /api/local-reader`
`{ "calibrated": true }` once the local reader has been calibrated.

### `POST /api/local-reader/calibrate`
Teaches the local reader a board style from a screenshot of the starting position.
The request is `{ "image_base64", "mime_type" }` as for `/api/recognize-image`.
The response is `{ "success", "fen", "seen_from_black", "error" }`; on failure the earlier
calibration is kept and `error` says what is wrong with the screenshot.

### `POST /api/gemini-models`
Lists the Gemini models the API key can use, for the model picker. Listing does not count
against the generation quota.

**Request:** `{ "custom_api_key": "..." }` — optional; the server's `GEMINI_API_KEY` is used without it.

**Response:**
```json
{
  "success": true,
  "models": ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-3.8-flash"],
  "default_model": "gemini-3.8-flash",
  "error": null
}
```
Only models that can write text are listed; embedding, speech, audio, live and image-generation
models are left out.

### `POST /api/parse-pgn`
Replays a PGN with python-chess. The frontend uses it for Chess960 games, which chess.js cannot play.

**Request:** `{ "pgn": "[Variant \"Chess960\"] ... 5. O-O-O O-O-O *" }`

**Response:**
```json
{
  "success": true,
  "headers": { "White": "Kolanimir", "Variant": "Chess960", "FEN": "rbkrnqbn/pppppppp/8/8/8/8/PPPPPPPP/RBKRNQBN w DAda - 0 1" },
  "moves": [{ "san": "Nf3", "uci": "e1f3", "color": "w", "before": "rbkrnqbn/pppppppp/8/8/8/8/PPPPPPPP/RBKRNQBN w DAda - 0 1" }],
  "fens": ["rbkrnqbn/pppppppp/8/8/8/8/PPPPPPPP/RBKRNQBN w DAda - 0 1", "..."],
  "chess960": true,
  "error": null
}
```
`fens` holds the start position and the position after every move; for Chess960 they are
Shredder-FENs (castling as rook files). An illegal move gives `success: false` and the reason.

### `GET /api/health`
Returns engine availability and API key configuration status.

---

## 📁 Project Structure

```
FenAnalyzer/
├── backend/
│   ├── main.py               # FastAPI · Stockfish UCI · Gemini AI · Pydantic models
│   ├── local_reader.py       # Reads screenshots locally against a calibrated board
│   ├── requirements.txt      # Python dependencies
│   ├── requirements-dev.txt  # Test dependencies (pytest)
│   └── .env.example          # Environment variable template
├── frontend/
│   └── src/
│       ├── api/
│       │   └── chessApi.js         # API client (fetch wrapper for all endpoints)
│       ├── components/
│       │   ├── BoardView.jsx       # Interactive board · drag-drop · best-move arrow
│       │   ├── BoardEditor.jsx     # Custom position builder · piece palette · FEN export
│       │   ├── FenInput.jsx        # FEN input · presets
│       │   ├── AnalysisSettings.jsx # Depth & MultiPV sliders with Apply, on every tab
│       │   ├── ImageImport.jsx     # Paste / upload / drop a board image for recognition
│       │   ├── ModelPicker.jsx     # Gemini model dropdown (header and next to a countdown)
│       │   ├── LanguagePicker.jsx  # Interface language in the header
│       │   ├── AnalysisPanel.jsx   # Evaluation · WDL bar · MultiPV lines · Gemini AI
│       │   ├── PgnViewer.jsx       # PGN import · move-by-move navigation · keyboard support
│       │   └── MoveLine.jsx        # Your moves since a loaded position · step back and forth
│       ├── i18n/
│       │   ├── index.jsx           # Language detection, provider, t() with English fallback
│       │   └── messages/           # The texts, one file per part, in en · de · ru · uk
│       ├── hooks/
│       │   ├── useTheme.js         # Dark/light theme state, persisted in localStorage
│       │   └── useGeminiCooldown.js # Per-model pause and countdown after a Gemini refusal
│       ├── utils/
│       │   ├── editorFen.js        # Board editor FEN parsing, building & validation
│       │   ├── imageFile.js        # Image type/size checks and base64 reading
│       │   ├── pgn.js              # Chess960 castling rights made readable for chess.js
│       │   ├── moveLine.js         # The list of your moves: add, branch, step, number
│       │   └── sound.js            # Synthesized Web Audio sound effects
│       ├── App.jsx                 # Top-level state orchestrator
│       ├── index.css               # Theme tokens (dark & light) & component styles
│       └── main.jsx                # React DOM entry point
├── tests/                          # Backend tests (pytest)
│   └── fixtures/                   # Board screenshots for the local reader tests
├── start.sh                        # One-command launcher (backend + frontend)
├── package.json                    # Root npm scripts
└── README.md
```

---

## 🧪 Tests

**Frontend** — [Vitest](https://vitest.dev/) with React Testing Library in a jsdom browser environment.
Test files sit next to the code they cover (`App.test.jsx`, `components/*.test.jsx`, ...).
The drag-and-drop board, the backend API and Web Audio are replaced with stubs.

```bash
cd frontend
npm test              # run once
npm run test:watch    # re-run on every file change
```

**Backend** — pytest, in `tests/`. Stockfish and the Gemini API are faked, so no engine,
network or API key is needed; one extra test runs the real Stockfish when it is installed.

```bash
uv run --no-project --with-requirements backend/requirements-dev.txt python -m pytest
```

Known bugs are pinned by tests that are expected to fail (`it.fails` in Vitest,
`@pytest.mark.xfail(strict=True)` in pytest). Once a bug is fixed, the run reports
the unexpected pass, and the marker should be removed.

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|---|---|
| `←` | Previous move (PGN mode); on the FEN tab, back one of your own moves |
| `→` | Next move (PGN mode); on the FEN tab, forward one of your own moves |
| `Ctrl+V` / `⌘V` | Paste an image of a board on the FEN tab |

---

## 🩺 Troubleshooting

| Message | What it means | Fix |
|---|---|---|
| *Cannot reach the app's server …* | The page is open, but the dev server that serves it (Vite) is not running, so no request gets through | Start the app with `./start.sh` in the project folder, then reload the page |
| *Server error: 500 — the backend is not answering …* | Vite is running, but the FastAPI backend behind it is not: Vite's proxy answers with an empty 500 | Start the app with `./start.sh` (or the backend alone, see Option B above) |
| *Gemini misread the board: rank 3 has 9 squares instead of 8 …* | Gemini returned a board that cannot exist (a miscounted rank, a missing rank, an unknown piece), so it is not put on the board | **Try Again**, preferably after choosing a stronger model in the image box. Keep the coordinates on the board edges in the picture: they help |
| *Backend Offline* in the header | The health check at page load got no answer from the backend | Same as above, then reload the page |

---

## 🛠️ Environment Variables

| Variable | Default | Description |
|---|---|---|
| `GEMINI_API_KEY` | — | Google Gemini API key for AI commentary |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Default Gemini model; the header's model picker can choose another per browser |
| `STOCKFISH_PATH` | auto-detect | Override Stockfish binary path |

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
