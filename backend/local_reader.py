"""Reads a chess position from a screenshot without any online model.

Screenshots from one site all share the same board and pieces, so no smart
model is needed: the user calibrates once with a screenshot of the starting
position, which shows every piece, and from then on each square of a new
screenshot is compared with the pieces cut out of it.

How a screenshot is read:
- the board is the largest area made of the two calibrated square colors;
- it is cut into 64 squares, and in each square the piece is told apart from
  the square by color, so a piece cut from a dark square still matches the
  same piece on a light or highlighted one;
- a square whose color is neither of the two is the highlighted last move:
  the piece standing on it moved, so the other side is to move;
- the rank numbers beside the board show which way up it is.
"""

from dataclasses import dataclass
import io
from typing import Dict, List, Optional, Tuple

import numpy as np
from PIL import Image, ImageFilter, UnidentifiedImageError

# Squares are compared at this size, whatever the size of the screenshot.
CELL = 48
# How far a square may be shifted against a piece, in pixels at CELL size;
# the board edges are found to within a pixel or two of the screenshot.
MAX_SHIFT = 2
# Squares are compared without this border, where the neighbours bleed in.
EDGE = 4
# A pixel differing from its square's color by more than this is a piece pixel.
PIECE_DISTANCE = 40.0
# A square with fewer piece pixels than this share is empty.
EMPTY_SHARE = 0.03
# A pixel this close to a square color counts as part of the board.
BOARD_DISTANCE = 40.0
# A square whose hue differs from its usual one by more than this is
# highlighted; the paper-like texture of squares stays well below it.
HIGHLIGHT_HUE = 8.0
# Pieces are blurred this much before comparing, so screenshots taken at
# another zoom, with outlines falling between pixels, still match.
BLUR_RADIUS = 1.5
# A square is reported as unsure when its best piece is off by more than
# this, or is not clearly closer than the next best. On the screenshots this
# was tuned on a right piece is off by up to 55, a wrong one by 239 or more.
UNSURE_SCORE = 150.0
UNSURE_RATIO = 0.4
# Pixels of the replaced square background in a piece image.
BACKGROUND_GRAY = 150.0

START_ROWS = ["rnbqkbnr", "pppppppp", "........", "........",
              "........", "........", "PPPPPPPP", "RNBQKBNR"]


class LocalReaderError(ValueError):
    """The screenshot cannot be read; the message says why, for the user."""


@dataclass
class Calibration:
    light: np.ndarray  # RGB of the light squares
    dark: np.ndarray  # RGB of the dark squares
    pieces: Dict[str, np.ndarray]  # FEN letter -> piece image, CELL x CELL
    # Rank numbers beside the board, "8" and "1"; None when the calibration
    # screenshot did not show them.
    labels: Optional[Dict[str, np.ndarray]] = None


# ── Image helpers ──────────────────────────────────────────────────────────────


def open_image(raw: bytes) -> np.ndarray:
    try:
        image = Image.open(io.BytesIO(raw)).convert("RGB")
    except (UnidentifiedImageError, OSError):
        raise LocalReaderError("Could not open this image. Use a PNG, JPEG or WebP screenshot.")
    return np.asarray(image).astype(np.float32)


def resize(pixels: np.ndarray, width: int, height: int) -> np.ndarray:
    image = Image.fromarray(pixels.astype(np.uint8))
    return np.asarray(image.resize((width, height), Image.BILINEAR)).astype(np.float32)


def hue(color: np.ndarray) -> np.ndarray:
    """A color without its brightness, so texture and shading drop out."""
    return color - color.mean()


def longest_run(flags: np.ndarray) -> Tuple[int, int]:
    """(start, end) of the longest run of True values."""
    best, start = (0, 0), None
    for i, flag in enumerate(list(flags) + [False]):
        if flag and start is None:
            start = i
        elif not flag and start is not None:
            if i - start > best[1] - best[0]:
                best = (start, i)
            start = None
    return best


# ── Board and squares ──────────────────────────────────────────────────────────


def square_colors(pixels: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    """(light, dark) square colors, from the middle of a screenshot of the
    starting position, where four ranks of empty squares are."""
    h, w, _ = pixels.shape
    middle = pixels[int(h * 0.38):int(h * 0.62), int(w * 0.38):int(w * 0.62)].reshape(-1, 3)
    brightness = middle.mean(1)
    # Two groups by brightness: a tiny k-means.
    a, b = np.percentile(brightness, 25), np.percentile(brightness, 75)
    for _ in range(10):
        nearer_a = np.abs(brightness - a) < np.abs(brightness - b)
        if nearer_a.all() or not nearer_a.any():
            break
        a, b = brightness[nearer_a].mean(), brightness[~nearer_a].mean()
    nearer_a = np.abs(brightness - a) < np.abs(brightness - b)
    if nearer_a.all() or not nearer_a.any():
        raise LocalReaderError(
            "No board was found: the middle of the image should show light and dark empty squares."
        )
    first, second = np.median(middle[nearer_a], 0), np.median(middle[~nearer_a], 0)
    return (first, second) if first.mean() > second.mean() else (second, first)


def find_board(pixels: np.ndarray, light: np.ndarray, dark: np.ndarray) -> Tuple[int, int, int, int]:
    """(top, bottom, left, right) of the board in the screenshot."""
    distance = np.minimum(
        np.linalg.norm(pixels - light, axis=2), np.linalg.norm(pixels - dark, axis=2)
    )
    on_board = distance < BOARD_DISTANCE
    # Even a rank full of pieces shows its squares between them.
    top, bottom = longest_run(on_board.mean(1) > 0.25)
    left, right = longest_run(on_board.mean(0) > 0.25)
    height, width = bottom - top, right - left
    if min(height, width) < 8 * 12:
        raise LocalReaderError(
            "No board in the calibrated style was found in the image. "
            "If the board looks different now, recalibrate with its starting position."
        )
    if abs(height - width) > 0.04 * max(height, width):
        raise LocalReaderError(
            f"The board found is not square ({width}×{height} px), so it was cut off or "
            "something covers it. Take a screenshot of the whole board."
        )
    return top, bottom, left, right


def cut_squares(pixels: np.ndarray, box: Tuple[int, int, int, int]) -> List[List[np.ndarray]]:
    """The 64 squares as seen, top row first, each resized to CELL x CELL."""
    top, bottom, left, right = box
    squares = []
    for row in range(8):
        y0, y1 = top + (bottom - top) * row // 8, top + (bottom - top) * (row + 1) // 8
        line = []
        for col in range(8):
            x0, x1 = left + (right - left) * col // 8, left + (right - left) * (col + 1) // 8
            line.append(resize(pixels[y0:y1, x0:x1], CELL, CELL))
        squares.append(line)
    return squares


def square_color(square: np.ndarray) -> np.ndarray:
    """The color of the square itself, from its border, where pieces rarely reach."""
    border = np.concatenate([
        square[:3].reshape(-1, 3), square[-3:].reshape(-1, 3),
        square[:, :3].reshape(-1, 3), square[:, -3:].reshape(-1, 3),
    ])
    return np.median(border, 0)


def piece_image(square: np.ndarray) -> Tuple[np.ndarray, float]:
    """(the piece in gray on a plain background, share of piece pixels)."""
    is_piece = np.linalg.norm(square - square_color(square), axis=2) > PIECE_DISTANCE
    gray = np.where(is_piece, square.mean(2), BACKGROUND_GRAY)
    blurred = Image.fromarray(gray.astype(np.uint8)).filter(ImageFilter.GaussianBlur(BLUR_RADIUS))
    return np.asarray(blurred).astype(np.float32), float(is_piece.mean())


def is_highlighted(square: np.ndarray, usual: np.ndarray) -> bool:
    return float(np.linalg.norm(hue(square_color(square)) - hue(usual))) > HIGHLIGHT_HUE


def match_piece(image: np.ndarray, pieces: Dict[str, np.ndarray]) -> Tuple[str, bool]:
    """(FEN letter of the closest piece, whether it is a sure match)."""
    inner = slice(EDGE, CELL - EDGE)
    shifts = range(-MAX_SHIFT, MAX_SHIFT + 1)
    scores = sorted(
        (
            min(
                float(((np.roll(image, (dy, dx), axis=(0, 1))[inner, inner] - piece[inner, inner]) ** 2).mean())
                for dy in shifts
                for dx in shifts
            ),
            letter,
        )
        for letter, piece in pieces.items()
    )
    (best, letter), (second, _) = scores[0], scores[1]
    return letter, best <= UNSURE_SCORE and best <= UNSURE_RATIO * second


# ── Rank numbers beside the board ──────────────────────────────────────────────


def label_beside(pixels: np.ndarray, box: Tuple[int, int, int, int], row: int) -> Optional[np.ndarray]:
    """The strip left of a row of squares, where sites write the rank number;
    None when the screenshot ends at the board."""
    top, bottom, left, _ = box
    cell = (bottom - top) / 8
    width = int(cell * 0.3)
    if left < width:
        return None
    y0, y1 = int(top + cell * row), int(top + cell * (row + 1))
    gray = resize(pixels[y0:y1, left - width:left].mean(2), CELL // 2, CELL)
    return gray - np.median(gray)


def white_at_bottom_by_labels(
    pixels: np.ndarray, box: Tuple[int, int, int, int], labels: Optional[Dict[str, np.ndarray]]
) -> Optional[bool]:
    """Whether the top row is rank 8, read from the rank number beside it;
    None when there is no number to read."""
    if not labels:
        return None
    strip = label_beside(pixels, box, 0)
    if strip is None:
        return None
    off_8 = float(((strip - labels["8"]) ** 2).mean())
    off_1 = float(((strip - labels["1"]) ** 2).mean())
    # The two numbers must be told apart clearly, or the strip shows neither.
    if min(off_8, off_1) > 0.5 * max(off_8, off_1):
        return None
    return off_8 < off_1


def white_at_bottom_by_pieces(rows: List[str]) -> bool:
    """Whether White plays up the board, judged from where the pawns, or
    failing them the kings, stand; for screenshots without rank numbers."""
    def mean_row(letters: str) -> Optional[float]:
        found = [i for i, row in enumerate(rows) for c in row if c in letters]
        return sum(found) / len(found) if found else None

    for white, black in (("P", "p"), ("K", "k")):
        w, b = mean_row(white), mean_row(black)
        if w is not None and b is not None and w != b:
            return w > b
    return True


# ── Calibration ────────────────────────────────────────────────────────────────


def calibrate(raw: bytes) -> Tuple[Calibration, bool]:
    """(calibration, seen_from_black) from a screenshot of the starting position."""
    pixels = open_image(raw)
    light, dark = square_colors(pixels)
    box = find_board(pixels, light, dark)
    squares = cut_squares(pixels, box)

    images = [[piece_image(square) for square in row] for row in squares]
    for row in range(8):
        for col in range(8):
            occupied = images[row][col][1] >= EMPTY_SHARE
            if occupied != (row in (0, 1, 6, 7)):
                raise LocalReaderError(
                    "This is not the starting position: "
                    f"the square in row {row + 1}, column {col + 1} from the top left is "
                    f"{'occupied' if occupied else 'empty'}. "
                    "Calibrate with a screenshot of the board before the first move."
                )

    # White pieces are the bright ones, whichever side is at the bottom.
    def brightness(row: int) -> float:
        return float(np.mean([squares[row][col].mean() for col in range(8)]))

    seen_from_black = brightness(0) + brightness(1) > brightness(6) + brightness(7)
    start = [row[::-1] for row in reversed(START_ROWS)] if seen_from_black else START_ROWS

    collected: Dict[str, List[np.ndarray]] = {}
    for row in (0, 1, 6, 7):
        for col in range(8):
            collected.setdefault(start[row][col], []).append(images[row][col][0])
    pieces = {letter: np.mean(found, 0) for letter, found in collected.items()}

    labels = None
    top, bottom = label_beside(pixels, box, 0), label_beside(pixels, box, 7)
    if top is not None and bottom is not None:
        labels = {"1": top, "8": bottom} if seen_from_black else {"8": top, "1": bottom}

    calibration = Calibration(light=light, dark=dark, pieces=pieces, labels=labels)

    # The pieces must read back as the position they were cut from.
    read = read_position(raw, calibration)
    expected_bottom_left = "h8" if seen_from_black else "a1"
    if read["rows"] != compact(start) or read["bottom_left"] != expected_bottom_left:
        raise LocalReaderError(
            "The pieces cut from this screenshot do not read back as the starting position. "
            "Take a sharper screenshot of the whole board."
        )
    return calibration, seen_from_black


# ── Reading ────────────────────────────────────────────────────────────────────


def compact(rows: List[str]) -> List[str]:
    """Rows of letters and dots written like FEN ranks: 'r..q' -> 'r2q'."""
    out = []
    for row in rows:
        text, empty = "", 0
        for c in row:
            if c == ".":
                empty += 1
                continue
            if empty:
                text += str(empty)
                empty = 0
            text += c
        out.append(text + (str(empty) if empty else ""))
    return out


def square_name(row: int, col: int, white_at_bottom: bool) -> str:
    if white_at_bottom:
        return "abcdefgh"[col] + str(8 - row)
    return "hgfedcba"[col] + str(row + 1)


def read_position(raw: bytes, calibration: Calibration) -> dict:
    """The position in a screenshot, in the shape Gemini answers in:
    {"rows": 8 FEN ranks as seen, top first, "bottom_left": "a1" | "h8",
     "turn": "w" | "b" | None}."""
    pixels = open_image(raw)
    box = find_board(pixels, calibration.light, calibration.dark)
    squares = cut_squares(pixels, box)

    rows, unsure, moved = [], [], []
    for row in range(8):
        letters = ""
        for col in range(8):
            square = squares[row][col]
            # The top left square is light whichever side is at the bottom.
            usual = calibration.light if (row + col) % 2 == 0 else calibration.dark
            image, share = piece_image(square)
            letter = "."
            if share >= EMPTY_SHARE:
                letter, sure = match_piece(image, calibration.pieces)
                if not sure:
                    unsure.append((row, col))
            if is_highlighted(square, usual):
                moved.append(letter)
            letters += letter
        rows.append(letters)

    white_at_bottom = white_at_bottom_by_labels(pixels, box, calibration.labels)
    if white_at_bottom is None:
        white_at_bottom = white_at_bottom_by_pieces(rows)

    if unsure:
        names = ", ".join(square_name(r, c, white_at_bottom) for r, c in unsure[:6])
        raise LocalReaderError(
            f"Could not tell which piece stands on {names}. If the pieces look different "
            "from the calibration screenshot, recalibrate, or read this image with Gemini."
        )

    # The last move lights up the square it came from, now empty, and the
    # one it went to, holding the piece that moved.
    movers = [letter for letter in moved if letter != "."]
    turn = None
    if len(moved) == 2 and len(movers) == 1:
        turn = "b" if movers[0].isupper() else "w"

    return {"rows": compact(rows), "bottom_left": "a1" if white_at_bottom else "h8", "turn": turn}


# ── Storage ────────────────────────────────────────────────────────────────────


def save(calibration: Calibration, path: str) -> None:
    arrays = {"light": calibration.light, "dark": calibration.dark}
    arrays.update({f"piece_{letter}": image for letter, image in calibration.pieces.items()})
    if calibration.labels:
        arrays.update({f"label_{name}": image for name, image in calibration.labels.items()})
    with open(path, "wb") as f:
        np.savez_compressed(f, **arrays)


def load(path: str) -> Optional[Calibration]:
    """The saved calibration, or None when there is none yet."""
    try:
        data = np.load(path)
    except (FileNotFoundError, OSError, ValueError):
        return None
    with data:
        pieces = {key[len("piece_"):]: data[key] for key in data.files if key.startswith("piece_")}
        labels = {key[len("label_"):]: data[key] for key in data.files if key.startswith("label_")}
        return Calibration(
            light=data["light"], dark=data["dark"], pieces=pieces, labels=labels or None
        )
