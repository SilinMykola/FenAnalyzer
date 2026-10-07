import asyncio
import base64
import binascii
import json
import os
import re
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


class GeminiError(Exception):
    """A Gemini request failed; the message is ready to show to the user."""


def get_gemini_key(custom_api_key: Optional[str]) -> Optional[str]:
    """The key from the UI wins over the server's own key; blank counts as none."""
    api_key = custom_api_key or os.environ.get("GEMINI_API_KEY")
    if not api_key or not api_key.strip():
        return None
    return api_key.strip()


GEMINI_KEY_MISSING = (
    "Gemini API Key is not configured. "
    "Please add GEMINI_API_KEY to backend/.env or enter it in settings."
)


async def call_gemini(api_key: str, body: dict, timeout: float = 20.0) -> tuple:
    """Sends a generateContent request and returns (response JSON, model name).

    Retries on 503 (overload) and 429 (rate limit) with growing pauses.
    Raises GeminiError when the request cannot be completed.
    """
    model_name = os.environ.get("GEMINI_MODEL", "gemini-3.8-flash").strip()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"

    # Retryable HTTP status codes: 503 = overload, 429 = rate limit
    RETRYABLE = {503, 429}
    MAX_RETRIES = 3

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            for attempt in range(1, MAX_RETRIES + 1):
                resp = await client.post(url, json=body)

                if resp.status_code == 200:
                    return resp.json(), model_name

                # Parse error message from JSON if available
                err_detail = resp.text
                try:
                    err_json = resp.json()
                    err_detail = err_json.get("error", {}).get("message", err_detail)
                except Exception:
                    pass

                if resp.status_code in RETRYABLE and attempt < MAX_RETRIES:
                    # Exponential backoff: 2s, 4s before next retry
                    await asyncio.sleep(2 * attempt)
                    continue

                # Non-retryable error or exhausted retries
                if resp.status_code in RETRYABLE:
                    raise GeminiError(
                        "Gemini servers are temporarily overloaded. "
                        "Please wait a moment and try again. "
                        f"(Tried {MAX_RETRIES} times)"
                    )
                raise GeminiError(f"Gemini API error ({resp.status_code}): {err_detail}")
    except GeminiError:
        raise
    # httpx timeouts and network errors often have an empty message, so
    # name what happened rather than show a bare "Failed to contact".
    except httpx.TimeoutException:
        raise GeminiError(
            f"Gemini did not answer within {timeout:g} seconds. It may be busy; please try again."
        )
    except httpx.NetworkError as e:
        raise GeminiError(
            f"Could not reach the Gemini API ({str(e) or type(e).__name__}). "
            "Check the internet connection."
        )
    except Exception as e:
        raise GeminiError(f"Failed to contact Gemini API: {str(e) or type(e).__name__}")


def first_candidate_text(data: dict) -> Optional[str]:
    """The text of Gemini's first answer, or None when it gave no answer."""
    candidates = data.get("candidates", [])
    if not candidates:
        return None
    parts = candidates[0].get("content", {}).get("parts") or [{}]
    return parts[0].get("text", "").strip()


@app.post("/api/ai-commentary", response_model=AiCommentaryResponse)
async def generate_ai_commentary(payload: AiCommentaryRequest):
    """Generates natural language grandmaster commentary using Gemini API."""
    api_key = get_gemini_key(payload.custom_api_key)
    if not api_key:
        return AiCommentaryResponse(success=False, commentary="", error=GEMINI_KEY_MISSING)

    prompt = f"""You are a distinguished FIDE Grandmaster and friendly chess coach.
Explain the strategic and tactical essence of this position to an improving chess player:
- Position (FEN): {payload.fen}
- Turn to move: {payload.turn.capitalize()}
- Stockfish Evaluation: {payload.score} ({payload.verbal_verdict or 'N/A'})
- Recommended Move: {payload.best_move_san} ({payload.explanation or 'Positional move'})

Instructions:
1. Provide a direct, instructive Grandmaster assessment in 2-4 sentences.
2. Clearly explain WHY {payload.best_move_san} is the strongest move (tactical trap, space advantage, piece activity, or defensive necessity).
3. Outline the immediate concrete plan for {payload.turn.capitalize()}.
4. Do NOT output a raw FEN breakdown or lists of piece locations; focus directly on ideas and plans."""

    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.4,
            "maxOutputTokens": 1000,
        },
    }

    try:
        data, model_name = await call_gemini(api_key, body)
    except GeminiError as e:
        return AiCommentaryResponse(success=False, commentary="", error=str(e))

    text = first_candidate_text(data)
    if text is None:
        return AiCommentaryResponse(
            success=False,
            commentary="",
            error="Gemini returned no commentary for this position.",
        )
    return AiCommentaryResponse(success=True, commentary=text, model=model_name)


# ── Position recognition from an image ─────────────────────────────────────────

# Image types Gemini accepts. GIF is not among them.
IMAGE_MIME_TYPES = {"image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"}
MAX_IMAGE_BYTES = 10 * 1024 * 1024

RECOGNIZE_PROMPT = """You are given an image of a chess position: a screenshot of a digital board, a printed diagram or a photo.
Read the position and answer with JSON only, in this exact shape:
{"board": "<piece placement>", "turn": "w" | "b" | null}

Rules:
- "board" is the first field of a FEN: 8 ranks separated by "/", from rank 8 down to rank 1, each rank from file a to file h. Uppercase letters for White pieces (KQRBNP), lowercase for Black (kqrbnp), digits 1-8 for runs of empty squares.
- If the board is shown from Black's side (rank 1 at the top, file h on the left), still write the placement from White's side. Use the coordinate labels on the board edges when they are visible.
- "turn" is the side to move only when the image shows it, for example a "White to move" caption or a highlighted last move (then the other side is to move). Otherwise use null.
- If there is no chess board in the image, answer {"board": null, "turn": null}."""


class RecognizeImageRequest(BaseModel):
    image_base64: str = Field(..., description="Image bytes as base64, with or without a data: URL prefix")
    mime_type: str = Field(..., description="Image MIME type, e.g. image/png")
    custom_api_key: Optional[str] = None


class RecognizeImageResponse(BaseModel):
    success: bool
    fen: Optional[str] = None
    # Whether the side to move was read from the image rather than guessed
    turn_detected: bool = False
    # Whether the position is legal, so it can be sent to Stockfish as is
    is_valid: bool = False
    model: Optional[str] = None
    error: Optional[str] = None


def decode_image(image_base64: str, mime_type: str) -> bytes:
    """Checks the uploaded image and returns its bytes; raises HTTPException if unusable."""
    if mime_type not in IMAGE_MIME_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported image type '{mime_type}'. Use PNG, JPEG or WebP.",
        )
    # Accept a whole data URL as produced by FileReader.readAsDataURL
    data = re.sub(r"^data:[^,]*,", "", image_base64.strip())
    try:
        raw = base64.b64decode(data, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="Image data is not valid base64.")
    if not raw:
        raise HTTPException(status_code=400, detail="Image is empty.")
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image is larger than 10 MB.")
    return raw


def parse_recognition(text: str) -> dict:
    """Reads Gemini's JSON answer, tolerating a ```json code fence around it."""
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
    answer = json.loads(cleaned)
    if not isinstance(answer, dict):
        raise ValueError("answer is not a JSON object")
    return answer


def build_recognized_board(placement: str, turn: Optional[str]) -> tuple:
    """Turns a recognized placement into a board; returns (board, turn_detected).

    Castling rights are granted wherever king and rook stand on their home
    squares, since an image cannot show whether they have moved. When the
    image does not show the side to move, White is assumed unless only
    Black to move gives a legal position (White's king already in check).
    """
    board = chess.Board(None)
    board.set_board_fen(placement.strip())  # raises ValueError if malformed

    board.set_castling_fen("KQkq")
    board.castling_rights = board.clean_castling_rights()

    if turn in ("w", "b"):
        board.turn = chess.WHITE if turn == "w" else chess.BLACK
        return board, True

    board.turn = chess.WHITE
    if not board.is_valid():
        black_to_move = board.copy()
        black_to_move.turn = chess.BLACK
        if black_to_move.is_valid():
            return black_to_move, False
    return board, False


@app.post("/api/recognize-image", response_model=RecognizeImageResponse)
async def recognize_image(payload: RecognizeImageRequest):
    """Reads a chess position from an image with Gemini and returns it as FEN."""
    raw = decode_image(payload.image_base64, payload.mime_type)

    api_key = get_gemini_key(payload.custom_api_key)
    if not api_key:
        return RecognizeImageResponse(success=False, error=GEMINI_KEY_MISSING)

    body = {
        "contents": [
            {
                "parts": [
                    {"text": RECOGNIZE_PROMPT},
                    {
                        "inline_data": {
                            "mime_type": payload.mime_type,
                            "data": base64.b64encode(raw).decode("ascii"),
                        }
                    },
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0,
            "responseMimeType": "application/json",
            "maxOutputTokens": 2000,
        },
    }

    try:
        # Reading an image takes Gemini much longer than writing commentary
        data, model_name = await call_gemini(api_key, body, timeout=120.0)
    except GeminiError as e:
        return RecognizeImageResponse(success=False, error=str(e))

    text = first_candidate_text(data)
    if not text:
        return RecognizeImageResponse(
            success=False, model=model_name, error="Gemini returned no answer for this image."
        )

    try:
        answer = parse_recognition(text)
    except ValueError:
        return RecognizeImageResponse(
            success=False, model=model_name, error="Could not understand Gemini's answer. Please try again."
        )

    placement = answer.get("board")
    if not placement:
        return RecognizeImageResponse(
            success=False, model=model_name, error="No chess board was found in the image."
        )

    try:
        board, turn_detected = build_recognized_board(str(placement), answer.get("turn"))
    except ValueError:
        return RecognizeImageResponse(
            success=False,
            model=model_name,
            error="The board in the image could not be read reliably. Try a clearer or tighter crop.",
        )

    return RecognizeImageResponse(
        success=True,
        fen=board.fen(),
        turn_detected=turn_detected,
        is_valid=board.is_valid(),
        model=model_name,
    )
