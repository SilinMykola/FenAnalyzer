import asyncio
import os
import shutil
from typing import List, Optional

import chess
import chess.engine
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
from pydantic import BaseModel, Field

# Load environment variables from backend/.env or system environment
load_dotenv()

app = FastAPI(
    title="FEN Chess Analyzer API",
    description="Backend API powering Stockfish chess analysis for FEN positions",
    version="1.2.0",
)

# Enable CORS for frontend development server
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def find_stockfish() -> str:
    """Detect Stockfish binary path on the system."""
    custom_path = os.environ.get("STOCKFISH_PATH")
    if custom_path and os.path.isfile(custom_path):
        return custom_path

    which_path = shutil.which("stockfish")
    if which_path:
        return which_path

    candidates = [
        "/opt/homebrew/bin/stockfish",
        "/usr/local/bin/stockfish",
        "/usr/bin/stockfish",
    ]
    for p in candidates:
        if os.path.isfile(p):
            return p

    return "stockfish"


STOCKFISH_PATH = find_stockfish()

# Standard piece values for material calculation
PIECE_VALUES = {
    chess.PAWN: 1,
    chess.KNIGHT: 3,
    chess.BISHOP: 3,
    chess.ROOK: 5,
    chess.QUEEN: 9,
}


class AnalyzeRequest(BaseModel):
    fen: str = Field(
        ...,
        description="FEN string representing the chess position",
        example="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    )
    depth: int = Field(default=16, ge=1, le=30, description="Search depth for Stockfish")
    multipv: int = Field(default=3, ge=1, le=5, description="Number of top lines to evaluate")


class LineInfo(BaseModel):
    rank: int
    move_uci: str
    move_san: str
    score: str
    score_cp: Optional[int] = None
    pv_san: List[str]
    pv_uci: List[str]
    explanation: Optional[str] = None


class WdlInfo(BaseModel):
    win_pct: float
    draw_pct: float
    loss_pct: float


class MaterialInfo(BaseModel):
    white: int
    black: int
    diff: int  # Positive: White advantage, Negative: Black advantage


class EngineStats(BaseModel):
    depth: int
    nodes: Optional[int] = None
    nps: Optional[int] = None
    time_seconds: Optional[float] = None


class AnalyzeResponse(BaseModel):
    fen: str
    turn: str
    is_check: bool
    is_checkmate: bool
    is_stalemate: bool
    verbal_verdict: str
    material: MaterialInfo
    wdl: Optional[WdlInfo] = None
    stats: EngineStats
    lines: List[LineInfo]


def calculate_material(board: chess.Board) -> MaterialInfo:
    """Calculates piece material for both sides."""
    white_score = sum(len(board.pieces(pt, chess.WHITE)) * val for pt, val in PIECE_VALUES.items())
    black_score = sum(len(board.pieces(pt, chess.BLACK)) * val for pt, val in PIECE_VALUES.items())
    return MaterialInfo(
        white=white_score,
        black=black_score,
        diff=white_score - black_score,
    )


def fmt_score(score: Optional[chess.engine.Score]) -> str:
    """Format evaluation score into human-readable string (e.g. +0.45 or M+2)."""
    if score is None:
        return "0.00"
    try:
        cp = score.white().score(mate_score=100000)
    except Exception:
        cp = None

    if cp is not None:
        return f"{cp / 100:+.2f}"

    mate = score.white().mate()
    if mate is not None:
        return f"M{mate:+d}"

    return str(score)


def get_verbal_verdict(score: Optional[chess.engine.Score], is_checkmate: bool, is_stalemate: bool) -> str:
    """Generates natural language assessment of the board situation."""
    if is_checkmate:
        return "Checkmate — game over"
    if is_stalemate:
        return "Draw by stalemate"

    if score is None:
        return "Position analysis unavailable"

    mate = score.white().mate()
    if mate is not None:
        if mate > 0:
            return f"White has a forced checkmate in {mate} move{'s' if mate > 1 else ''}"
        return f"Black has a forced checkmate in {abs(mate)} move{'s' if abs(mate) > 1 else ''}"

    try:
        cp = score.white().score(mate_score=100000)
    except Exception:
        return "Position evaluated"

    pawns = cp / 100.0
    if pawns > 4.0:
        return "Decisive winning advantage for White"
    elif pawns > 1.5:
        return "Clear advantage for White"
    elif pawns > 0.4:
        return "Slight advantage for White"
    elif pawns >= -0.4:
        return "Even position (balanced game)"
    elif pawns >= -1.5:
        return "Slight advantage for Black"
    elif pawns >= -4.0:
        return "Clear advantage for Black"
    else:
        return "Decisive winning advantage for Black"


def explain_move(board: chess.Board, move: chess.Move) -> str:
    """Explains why a move is tactically significant (captures, checks, castling, promotions)."""
    parts = []
    mover = board.piece_at(move.from_square)
    mover_name = chess.piece_name(mover.piece_type).capitalize() if mover else "Piece"
    dest_name = chess.square_name(move.to_square)

    if board.is_castling(move):
        if chess.square_file(move.to_square) == 6:
            return "Castles Kingside (O-O) to tuck king safely"
        return "Castles Queenside (O-O-O) connecting the rooks"

    if board.is_en_passant(move):
        parts.append(f"{mover_name} captures pawn en passant on {dest_name}")
    elif board.is_capture(move):
        victim = board.piece_at(move.to_square)
        victim_name = chess.piece_name(victim.piece_type).capitalize() if victim else "piece"
        parts.append(f"{mover_name} captures {victim_name} on {dest_name}")
    else:
        parts.append(f"{mover_name} moves to {dest_name}")

    if move.promotion:
        promo_name = chess.piece_name(move.promotion).capitalize()
        parts.append(f"promotes to {promo_name}")

    if board.gives_check(move):
        parts.append("delivers check")

    return " & ".join(parts)


@app.get("/api/health")
def health_check():
    gemini_key = os.environ.get("GEMINI_API_KEY")
    return {
        "status": "ok",
        "engine_path": STOCKFISH_PATH,
        "engine_available": os.path.isfile(STOCKFISH_PATH) or bool(shutil.which(STOCKFISH_PATH)),
        "gemini_configured": bool(gemini_key and gemini_key.strip()),
    }


@app.post("/api/analyze", response_model=AnalyzeResponse)
def analyze_position(payload: AnalyzeRequest):
    fen = payload.fen.strip()

    try:
        board = chess.Board(fen)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid FEN string: {e}")

    if not board.is_valid():
        raise HTTPException(
            status_code=400,
            detail="Impossible chess position (e.g., pawns on 1st/8th rank, kings touching, invalid checks)",
        )

    material = calculate_material(board)

    # Check for game over before calling engine
    if board.is_game_over():
        return AnalyzeResponse(
            fen=board.fen(),
            turn="white" if board.turn == chess.WHITE else "black",
            is_check=board.is_check(),
            is_checkmate=board.is_checkmate(),
            is_stalemate=board.is_stalemate(),
            verbal_verdict="Checkmate" if board.is_checkmate() else "Game drawn",
            material=material,
            wdl=None,
            stats=EngineStats(depth=0),
            lines=[],
        )

    try:
        with chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH) as engine:
            # Enable WDL statistics if supported
            try:
                engine.configure({"UCI_ShowWDL": True})
            except Exception:
                pass

            info = engine.analyse(
                board,
                chess.engine.Limit(depth=payload.depth),
                multipv=payload.multipv,
            )
    except FileNotFoundError:
        raise HTTPException(
            status_code=500,
            detail=f"Stockfish binary not found at '{STOCKFISH_PATH}'. Ensure stockfish is installed (`brew install stockfish`).",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Engine analysis failed: {str(e)}")

    if isinstance(info, dict):
        info = [info]

    primary_info = info[0] if info else {}
    top_score = primary_info.get("score")

    # WDL (Win/Draw/Loss probabilities)
    wdl_data = None
    if "wdl" in primary_info and primary_info["wdl"] is not None:
        try:
            w_wdl = primary_info["wdl"].white()
            total = w_wdl.wins + w_wdl.draws + w_wdl.losses
            if total > 0:
                wdl_data = WdlInfo(
                    win_pct=round((w_wdl.wins / total) * 100, 1),
                    draw_pct=round((w_wdl.draws / total) * 100, 1),
                    loss_pct=round((w_wdl.losses / total) * 100, 1),
                )
        except Exception:
            wdl_data = None

    stats = EngineStats(
        depth=primary_info.get("depth", payload.depth),
        nodes=primary_info.get("nodes"),
        nps=primary_info.get("nps"),
        time_seconds=round(primary_info["time"], 3) if "time" in primary_info else None,
    )

    lines: List[LineInfo] = []
    for rank, line in enumerate(info, 1):
        pv = line.get("pv", [])
        if not pv:
            continue

        best_move = pv[0]
        try:
            move_san = board.san(best_move)
        except Exception:
            move_san = best_move.uci()

        explanation = explain_move(board, best_move)

        # Build preview of principal variation
        temp_board = board.copy()
        pv_san_list: List[str] = []
        pv_uci_list: List[str] = []
        for mv in pv[:8]:
            try:
                pv_san_list.append(temp_board.san(mv))
                temp_board.push(mv)
                pv_uci_list.append(mv.uci())
            except Exception:
                break

        line_score = line.get("score")
        cp_val = None
        if line_score:
            try:
                cp_val = line_score.white().score(mate_score=100000)
            except Exception:
                pass

        lines.append(
            LineInfo(
                rank=rank,
                move_uci=best_move.uci(),
                move_san=move_san,
                score=fmt_score(line_score),
                score_cp=cp_val,
                pv_san=pv_san_list,
                pv_uci=pv_uci_list,
                explanation=explanation,
            )
        )

    verbal_verdict = get_verbal_verdict(top_score, board.is_checkmate(), board.is_stalemate())

    return AnalyzeResponse(
        fen=board.fen(),
        turn="white" if board.turn == chess.WHITE else "black",
        is_check=board.is_check(),
        is_checkmate=board.is_checkmate(),
        is_stalemate=board.is_stalemate(),
        verbal_verdict=verbal_verdict,
        material=material,
        wdl=wdl_data,
        stats=stats,
        lines=lines,
    )


class AiCommentaryRequest(BaseModel):
    fen: str
    turn: str
    score: str
    best_move_san: str
    explanation: Optional[str] = None
    verbal_verdict: Optional[str] = None
    custom_api_key: Optional[str] = None


class AiCommentaryResponse(BaseModel):
    success: bool
    commentary: str
    model: str = "gemini-3.8-flash"
    error: Optional[str] = None


@app.post("/api/ai-commentary", response_model=AiCommentaryResponse)
async def generate_ai_commentary(payload: AiCommentaryRequest):
    """Generates natural language grandmaster commentary using Gemini API."""
    api_key = payload.custom_api_key or os.environ.get("GEMINI_API_KEY")
    if not api_key or not api_key.strip():
        return AiCommentaryResponse(
            success=False,
            commentary="",
            error="Gemini API Key is not configured. Please add GEMINI_API_KEY to backend/.env or enter it in settings.",
        )

    prompt = f"""You are a distinguished FIDE Grandmaster and friendly chess coach.
Explain the strategic and tactical essence of this position to an improving chess player:
- Position (FEN): {payload.fen}
- Turn to move: {payload.turn.capitalize()}
- Stockfish Evaluation: {payload.score} ({payload.verbal_verdict or 'N/A'})
- Recommended Move: {payload.best_move_san} ({payload.explanation or 'Positional move'})

Instructions:
1. Write 2 to 3 concise, clear sentences.
2. Explain the key tactical threat or positional advantage created by {payload.best_move_san}.
3. Mention what plan {payload.turn.capitalize()} should follow next.
4. Keep the tone inspiring and instructive like a grandmaster analyzing a post-game review."""

    model_name = os.environ.get("GEMINI_MODEL", "gemini-3.8-flash").strip()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key.strip()}"
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.4,
            "maxOutputTokens": 350,
        },
    }

    # Retryable HTTP status codes: 503 = overload, 429 = rate limit
    RETRYABLE = {503, 429}
    MAX_RETRIES = 3
    last_error = "Unknown error"

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            for attempt in range(1, MAX_RETRIES + 1):
                resp = await client.post(url, json=body)

                if resp.status_code == 200:
                    data = resp.json()
                    candidates = data.get("candidates", [])
                    if not candidates:
                        return AiCommentaryResponse(
                            success=False,
                            commentary="",
                            error="Gemini returned no commentary for this position.",
                        )
                    text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "").strip()
                    return AiCommentaryResponse(
                        success=True,
                        commentary=text,
                        model=model_name,
                    )

                # Parse error message from JSON if available
                err_detail = resp.text
                try:
                    err_json = resp.json()
                    err_detail = err_json.get("error", {}).get("message", err_detail)
                except Exception:
                    pass

                if resp.status_code in RETRYABLE and attempt < MAX_RETRIES:
                    # Exponential backoff: 2s, 4s before next retry
                    wait_seconds = 2 * attempt
                    await asyncio.sleep(wait_seconds)
                    last_error = err_detail
                    continue

                # Non-retryable error or exhausted retries
                if resp.status_code in RETRYABLE:
                    friendly = (
                        "Gemini servers are temporarily overloaded. "
                        "Please wait a moment and try again. "
                        f"(Tried {MAX_RETRIES} times)"
                    )
                    return AiCommentaryResponse(
                        success=False,
                        commentary="",
                        error=friendly,
                    )

                return AiCommentaryResponse(
                    success=False,
                    commentary="",
                    error=f"Gemini API error ({resp.status_code}): {err_detail}",
                )

    except Exception as e:
        return AiCommentaryResponse(
            success=False,
            commentary="",
            error=f"Failed to contact Gemini API: {str(e)}",
        )

