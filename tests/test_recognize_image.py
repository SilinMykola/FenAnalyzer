"""Tests for POST /api/recognize-image, which reads a position from an image.

Gemini is faked by the `gemini` fixture in conftest.py: each test queues the
answer Gemini "gives" and can inspect the request that was sent.
"""

import base64
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from backend import main

client = TestClient(main.app)

# Any bytes will do: the image is only passed through to (fake) Gemini.
PNG_BYTES = b"\x89PNG\r\n\x1a\nfake image"
PNG_BASE64 = base64.b64encode(PNG_BYTES).decode()


def recognize(image=PNG_BASE64, mime_type="image/png", **extra):
    return client.post(
        "/api/recognize-image",
        json={"image_base64": image, "mime_type": mime_type, **extra},
    )


def gemini_answer(answer):
    """Gemini's reply carrying `answer` (a dict, or raw text) as its JSON output."""
    text = answer if isinstance(answer, str) else json.dumps(answer)
    return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": text}]}}]})


@pytest.fixture
def with_key(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "server-key")


class TestImageValidation:
    @pytest.mark.parametrize("mime_type", ["image/gif", "text/plain", "application/pdf"])
    def test_rejects_unsupported_types(self, gemini, with_key, mime_type):
        response = recognize(mime_type=mime_type)

        assert response.status_code == 415
        assert "Use PNG, JPEG or WebP" in response.json()["detail"]
        assert gemini.requests == []

    def test_rejects_data_that_is_not_base64(self, gemini, with_key):
        response = recognize(image="not base64!!")

        assert response.status_code == 400
        assert response.json()["detail"] == "Image data is not valid base64."

    def test_rejects_an_empty_image(self, gemini, with_key):
        assert recognize(image="").status_code == 400

    def test_rejects_an_image_over_10_mb(self, gemini, with_key):
        too_big = base64.b64encode(b"\0" * (main.MAX_IMAGE_BYTES + 1)).decode()

        response = recognize(image=too_big)

        assert response.status_code == 413
        assert gemini.requests == []

    def test_accepts_a_whole_data_url(self, gemini, with_key):
        gemini.reply(gemini_answer({"board": "4k3/8/8/8/8/8/8/4K3", "turn": None}))

        response = recognize(image=f"data:image/png;base64,{PNG_BASE64}")

        assert response.json()["success"] is True
        sent = json.loads(gemini.requests[0].content)
        assert sent["contents"][0]["parts"][1]["inline_data"]["data"] == PNG_BASE64


class TestGeminiRequest:
    def test_needs_an_api_key(self, gemini):
        body = recognize().json()

        assert body["success"] is False
        assert "Gemini API Key is not configured" in body["error"]
        assert gemini.requests == []

    def test_the_users_key_wins_over_the_servers(self, gemini, with_key):
        gemini.reply(gemini_answer({"board": "4k3/8/8/8/8/8/8/4K3", "turn": None}))

        recognize(custom_api_key="user-key")

        assert gemini.requests[0].url.params["key"] == "user-key"

    def test_sends_the_image_with_instructions(self, gemini, with_key):
        gemini.reply(gemini_answer({"board": "4k3/8/8/8/8/8/8/4K3", "turn": None}))

        recognize(mime_type="image/jpeg")

        sent = json.loads(gemini.requests[0].content)
        prompt, image = sent["contents"][0]["parts"]
        assert '"board"' in prompt["text"] and "FEN" in prompt["text"]
        assert image["inline_data"] == {"mime_type": "image/jpeg", "data": PNG_BASE64}
        # Deterministic JSON output: the answer is parsed, not shown as prose.
        assert sent["generationConfig"]["responseMimeType"] == "application/json"
        assert sent["generationConfig"]["temperature"] == 0

    def test_reports_gemini_errors(self, gemini, with_key):
        gemini.reply(httpx.Response(400, json={"error": {"message": "API key not valid"}}))

        body = recognize().json()

        assert body == {
            "success": False,
            "fen": None,
            "turn_detected": False,
            "is_valid": False,
            "model": None,
            "error": "Gemini API error (400): API key not valid",
        }

    def test_gives_gemini_two_minutes_to_read_the_image(self, gemini, with_key):
        gemini.reply(httpx.ReadTimeout(""))

        body = recognize().json()

        assert body["error"] == (
            "Gemini did not answer within 120 seconds. It may be busy; please try again."
        )

    def test_retries_a_busy_server(self, gemini, with_key):
        busy = httpx.Response(503, text="overloaded")
        gemini.reply(busy, gemini_answer({"board": "4k3/8/8/8/8/8/8/4K3", "turn": None}))

        assert recognize().json()["success"] is True
        assert gemini.sleeps == [2]


class TestReadingTheAnswer:
    def answer(self, gemini, answer):
        gemini.reply(gemini_answer(answer))
        return recognize().json()

    def test_returns_the_recognized_position(self, gemini, with_key):
        body = self.answer(gemini, {"board": "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R", "turn": "w"})

        assert body["success"] is True
        assert body["fen"] == "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1"
        assert body["turn_detected"] is True
        assert body["is_valid"] is True
        assert body["model"] == "gemini-3.8-flash"

    def test_takes_black_to_move_from_the_image(self, gemini, with_key):
        body = self.answer(gemini, {"board": "4k3/8/8/8/8/8/8/4K3", "turn": "b"})

        assert body["fen"] == "4k3/8/8/8/8/8/8/4K3 b - - 0 1"
        assert body["turn_detected"] is True

    def test_assumes_white_to_move_when_the_image_does_not_show_it(self, gemini, with_key):
        body = self.answer(gemini, {"board": "4k3/8/8/8/8/8/8/4K3", "turn": None})

        assert body["fen"] == "4k3/8/8/8/8/8/8/4K3 w - - 0 1"
        assert body["turn_detected"] is False

    def test_picks_black_to_move_when_only_that_is_legal(self, gemini, with_key):
        # The white rook on e1 already checks the black king, so White to
        # move is impossible and Black must be the side to move.
        body = self.answer(gemini, {"board": "4k3/8/8/8/8/8/8/K3R3", "turn": None})

        assert body["fen"] == "4k3/8/8/8/8/8/8/K3R3 b - - 0 1"
        assert body["turn_detected"] is False
        assert body["is_valid"] is True

    def test_grants_castling_only_where_king_and_rook_are_home(self, gemini, with_key):
        body = self.answer(gemini, {"board": "r3k3/8/8/8/8/8/8/4K2R", "turn": "w"})

        assert body["fen"] == "r3k3/8/8/8/8/8/8/4K2R w Kq - 0 1"

    def test_returns_an_illegal_position_flagged_as_invalid(self, gemini, with_key):
        # A misread piece can leave a side without its king.
        body = self.answer(gemini, {"board": "8/8/8/8/8/8/8/4K3", "turn": None})

        assert body["success"] is True
        assert body["fen"] == "8/8/8/8/8/8/8/4K3 w - - 0 1"
        assert body["is_valid"] is False

    def test_accepts_an_answer_wrapped_in_a_code_fence(self, gemini, with_key):
        fenced = '```json\n{"board": "4k3/8/8/8/8/8/8/4K3", "turn": "w"}\n```'

        assert self.answer(gemini, fenced)["fen"] == "4k3/8/8/8/8/8/8/4K3 w - - 0 1"

    def test_no_board_in_the_image(self, gemini, with_key):
        body = self.answer(gemini, {"board": None, "turn": None})

        assert body["success"] is False
        assert body["error"] == "No chess board was found in the image."

    @pytest.mark.parametrize(
        "placement",
        ["8/8/8/8/8/8/8", "4k3/8/8/8/8/8/8/4K3X", "9/8/8/8/8/8/8/8", "4k4/8/8/8/8/8/8/4K3"],
    )
    def test_a_malformed_board(self, gemini, with_key, placement):
        body = self.answer(gemini, {"board": placement, "turn": "w"})

        assert body["success"] is False
        assert "could not be read reliably" in body["error"]

    @pytest.mark.parametrize("text", ["White is winning", "[1, 2, 3]"])
    def test_an_answer_that_is_not_the_expected_json(self, gemini, with_key, text):
        body = self.answer(gemini, text)

        assert body["success"] is False
        assert body["error"] == "Could not understand Gemini's answer. Please try again."

    def test_an_empty_answer(self, gemini, with_key):
        assert self.answer(gemini, "")["error"] == "Gemini returned no answer for this image."

    def test_no_answer_at_all(self, gemini, with_key):
        gemini.reply(httpx.Response(200, json={"candidates": []}))

        body = recognize().json()

        assert body["error"] == "Gemini returned no answer for this image."
