"""Tests for the local board reader and its endpoints.

The screenshots in tests/fixtures come from one site, scaled down to 600 px
wide each; their boards ended up 555 to 569 px across, so reading them also
covers screenshots taken at another zoom than the calibration one.
"""

import base64
import io
import os

import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from backend import local_reader, main

client = TestClient(main.app)

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures")


def fixture(name: str) -> bytes:
    with open(os.path.join(FIXTURES, name), "rb") as f:
        return f.read()


START = fixture("start_white_bottom.png")
# After 1.e4 e5 2.Nf3 Bc5 3.Bc4 Qf6 4.d3 h6, the last move highlighted.
WHITE_TO_MOVE = fixture("white_to_move.png")
WHITE_TO_MOVE_FEN = "rnb1k1nr/pppp1pp1/5q1p/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 1"
# Seen from Black's side, after White's d2-d4, highlighted.
BLACK_TO_MOVE = fixture("black_to_move_seen_from_black.png")
BLACK_TO_MOVE_FEN = "r1bqkbnr/p1pp2pp/2p2p2/4p3/3PP3/5N2/PPP2PPP/RNBQK2R b KQkq - 0 1"


def edited(raw: bytes, edit) -> bytes:
    """The screenshot changed by edit(image), as PNG bytes."""
    image = Image.open(io.BytesIO(raw)).convert("RGB")
    image = edit(image) or image
    out = io.BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


def b64(raw: bytes) -> str:
    return base64.b64encode(raw).decode()


@pytest.fixture(scope="module")
def calibration():
    return local_reader.calibrate(START)[0]


class TestCalibrate:
    def test_learns_every_piece_and_the_rank_numbers(self, calibration):
        assert sorted(calibration.pieces) == sorted("KQRBNPkqrbnp")
        assert sorted(calibration.labels) == ["1", "8"]

    def test_tells_the_board_was_seen_from_whites_side(self):
        assert local_reader.calibrate(START)[1] is False

    def test_learns_from_a_starting_position_seen_from_blacks_side(self, calibration):
        pixels = local_reader.open_image(START)
        top, bottom, left, right = local_reader.find_board(pixels, calibration.light, calibration.dark)
        cell = (bottom - top) / 8

        def seen_from_black(image):
            # Squares and rank numbers swap places; the pieces stay upright,
            # as a site draws them.
            turned = image.copy()
            for row in range(8):
                y, to_y = round(top + cell * row), round(top + cell * (7 - row))
                band = image.crop((0, y, left, y + round(cell)))
                turned.paste(band, (0, to_y))
                for col in range(8):
                    x, to_x = round(left + cell * col), round(left + cell * (7 - col))
                    square = image.crop((x, y, x + round(cell), y + round(cell)))
                    turned.paste(square, (to_x, to_y))
            return turned

        calibration, seen_from_black = local_reader.calibrate(edited(START, seen_from_black))

        assert seen_from_black is True
        assert local_reader.read_position(WHITE_TO_MOVE, calibration)["rows"][2] == "5q1p"

    def test_refuses_a_position_other_than_the_start(self):
        with pytest.raises(local_reader.LocalReaderError, match="not the starting position"):
            local_reader.calibrate(WHITE_TO_MOVE)

    def test_refuses_an_image_without_a_board(self):
        blank = edited(START, lambda image: Image.new("RGB", image.size, (60, 60, 60)))

        with pytest.raises(local_reader.LocalReaderError, match="No board"):
            local_reader.calibrate(blank)

    def test_refuses_what_is_not_an_image(self):
        with pytest.raises(local_reader.LocalReaderError, match="Could not open"):
            local_reader.calibrate(b"not an image")


class TestReadPosition:
    def test_reads_a_board_seen_from_whites_side(self, calibration):
        assert local_reader.read_position(WHITE_TO_MOVE, calibration) == {
            "rows": ["rnb1k1nr", "pppp1pp1", "5q1p", "2b1p3", "2B1P3", "3P1N2", "PPP2PPP", "RNBQK2R"],
            "bottom_left": "a1",
            "turn": "w",
        }

    def test_reads_a_board_seen_from_blacks_side_as_it_appears(self, calibration):
        assert local_reader.read_position(BLACK_TO_MOVE, calibration) == {
            "rows": ["R2KQBNR", "PPP2PPP", "2N5", "3PP3", "3p4", "2p2p2", "pp2pp1p", "rnbkqb1r"],
            "bottom_left": "h8",
            "turn": "b",
        }

    def test_tells_the_side_from_the_rank_numbers(self, calibration):
        def by_labels(raw):
            pixels = local_reader.open_image(raw)
            box = local_reader.find_board(pixels, calibration.light, calibration.dark)
            return local_reader.white_at_bottom_by_labels(pixels, box, calibration.labels)

        assert by_labels(WHITE_TO_MOVE) is True
        assert by_labels(BLACK_TO_MOVE) is False

    def test_judges_the_side_from_the_pawns_without_rank_numbers(self, calibration):
        # Cut the numbers off: the screenshot now starts at the board's edge.
        pixels = local_reader.open_image(BLACK_TO_MOVE)
        _, _, left, _ = local_reader.find_board(pixels, calibration.light, calibration.dark)
        cropped = edited(BLACK_TO_MOVE, lambda image: image.crop((left, 0, image.width, image.height)))

        assert local_reader.read_position(cropped, calibration)["bottom_left"] == "h8"

    def test_reads_a_screenshot_taken_at_another_zoom(self, calibration):
        smaller = edited(
            WHITE_TO_MOVE,
            lambda image: image.resize((image.width * 3 // 4, image.height * 3 // 4), Image.LANCZOS),
        )

        assert local_reader.read_position(smaller, calibration)["rows"][2] == "5q1p"

    def test_leaves_the_turn_open_without_a_highlighted_move(self, calibration):
        assert local_reader.read_position(START, calibration)["turn"] is None

    def test_names_a_square_it_cannot_match(self, calibration):
        pixels = local_reader.open_image(WHITE_TO_MOVE)
        top, bottom, left, right = local_reader.find_board(pixels, calibration.light, calibration.dark)
        cell = (bottom - top) / 8

        def draw_on_d5(image):
            x, y = left + cell * 3, top + cell * 3
            ImageDraw.Draw(image).ellipse(
                (x + cell * 0.2, y + cell * 0.2, x + cell * 0.8, y + cell * 0.8), fill=(200, 30, 30)
            )

        with pytest.raises(local_reader.LocalReaderError, match="stands on d5"):
            local_reader.read_position(edited(WHITE_TO_MOVE, draw_on_d5), calibration)


class TestStorage:
    def test_a_saved_calibration_reads_the_same(self, calibration, tmp_path):
        path = str(tmp_path / "board.npz")
        local_reader.save(calibration, path)

        loaded = local_reader.load(path)

        assert local_reader.read_position(BLACK_TO_MOVE, loaded) == local_reader.read_position(
            BLACK_TO_MOVE, calibration
        )

    def test_there_is_nothing_to_load_before_calibrating(self, tmp_path):
        assert local_reader.load(str(tmp_path / "missing.npz")) is None


def calibrate(raw=START):
    return client.post(
        "/api/local-reader/calibrate", json={"image_base64": b64(raw), "mime_type": "image/png"}
    )


def recognize_locally(raw):
    return client.post(
        "/api/recognize-image",
        json={"image_base64": b64(raw), "mime_type": "image/png", "reader": "local"},
    )


class TestEndpoints:
    def test_not_calibrated_at_first(self):
        assert client.get("/api/local-reader").json() == {"calibrated": False}

    def test_calibrating_makes_the_reader_ready(self):
        body = calibrate().json()

        assert body["success"] is True
        assert body["fen"] == main.chess.STARTING_FEN
        assert client.get("/api/local-reader").json() == {"calibrated": True}

    def test_a_failed_calibration_keeps_the_earlier_one(self):
        calibrate()

        body = calibrate(WHITE_TO_MOVE).json()

        assert body["success"] is False
        assert "not the starting position" in body["error"]
        assert recognize_locally(WHITE_TO_MOVE).json()["success"] is True

    def test_calibration_checks_the_image_like_recognition(self):
        response = client.post(
            "/api/local-reader/calibrate", json={"image_base64": b64(START), "mime_type": "image/gif"}
        )

        assert response.status_code == 415

    def test_reading_before_calibrating_says_what_to_do(self, gemini):
        body = recognize_locally(WHITE_TO_MOVE).json()

        assert body["success"] is False
        assert body["error"] == main.LOCAL_NOT_CALIBRATED
        assert gemini.requests == []

    def test_reads_a_position_without_asking_gemini(self, gemini):
        calibrate()

        body = recognize_locally(WHITE_TO_MOVE).json()

        assert body["success"] is True
        assert body["fen"] == WHITE_TO_MOVE_FEN
        assert body["turn_detected"] is True
        assert body["is_valid"] is True
        assert body["seen_from_black"] is False
        assert body["model"] == "local"
        assert gemini.requests == []

    def test_turns_a_board_seen_from_blacks_side(self):
        calibrate()

        body = recognize_locally(BLACK_TO_MOVE).json()

        assert body["fen"] == BLACK_TO_MOVE_FEN
        assert body["seen_from_black"] is True

    def test_reports_what_it_could_not_read(self):
        calibrate()
        blank = edited(START, lambda image: Image.new("RGB", image.size, (60, 60, 60)))

        body = recognize_locally(blank).json()

        assert body["success"] is False
        assert "No board" in body["error"]
