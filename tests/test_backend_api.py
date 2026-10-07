"""HTTP-level tests for the FastAPI endpoints in backend/main.py.

Stockfish is replaced by FakeEngine (see conftest.py) and Gemini by an httpx
MockTransport, so these tests need neither the engine nor the network.
"""

import json
import shutil

import chess
import chess.engine
import httpx
import pytest
from fastapi.testclient import TestClient

from backend import main
from conftest import line, pov

START_FEN = chess.STARTING_FEN
FOOLS_MATE = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3"
STALEMATE = "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"

client = TestClient(main.app)


def analyze(fen=START_FEN, **params):
    return client.post("/api/analyze", json={"fen": fen, **params})


class TestHealth:
    def test_reports_the_engine_and_gemini_status(self, monkeypatch):
        monkeypatch.setenv("GEMINI_API_KEY", "key")

        body = client.get("/api/health").json()

        assert body["status"] == "ok"
        assert body["engine_path"] == main.STOCKFISH_PATH
        assert isinstance(body["engine_available"], bool)
        assert body["gemini_configured"] is True

    @pytest.mark.parametrize("value", [None, "", "   "])
    def test_gemini_is_not_configured_without_a_real_key(self, monkeypatch, value):
        if value is not None:
            monkeypatch.setenv("GEMINI_API_KEY", value)

        assert client.get("/api/health").json()["gemini_configured"] is False

    def test_engine_is_unavailable_when_the_binary_is_missing(self, monkeypatch):
        monkeypatch.setattr(main, "STOCKFISH_PATH", "/nowhere/stockfish")

        assert client.get("/api/health").json()["engine_available"] is False


class TestAnalyzeValidation:
    def test_rejects_a_malformed_fen(self, fake_engine):
        engine = fake_engine()

        response = analyze("not a fen")

        assert response.status_code == 400
        assert response.json()["detail"].startswith("Invalid FEN string")
        assert engine.calls == []

    def test_rejects_an_impossible_position(self, fake_engine):
        engine = fake_engine()

        response = analyze("P3k3/8/8/8/8/8/8/4K3 w - - 0 1")

        assert response.status_code == 400
        assert "Impossible chess position" in response.json()["detail"]
        assert engine.calls == []

    @pytest.mark.parametrize(
        "params",
        [{"depth": 0}, {"depth": 31}, {"multipv": 0}, {"multipv": 6}],
    )
    def test_rejects_out_of_range_settings(self, params):
        assert analyze(**params).status_code == 422

    def test_requires_a_fen(self):
        assert client.post("/api/analyze", json={}).status_code == 422


class TestAnalyzeGameOver:
    def test_checkmate_is_answered_without_the_engine(self, fake_engine):
        engine = fake_engine(error=AssertionError("engine must not be called"))

        body = analyze(FOOLS_MATE).json()

        assert engine.launched == {}
        assert body["is_checkmate"] is True
        assert body["is_check"] is True
        assert body["verbal_verdict"] == "Checkmate"
        assert body["turn"] == "white"
        assert body["lines"] == []
        assert body["stats"]["depth"] == 0
        assert body["wdl"] is None

    def test_stalemate_is_a_draw(self, fake_engine):
        fake_engine(error=AssertionError("engine must not be called"))

        body = analyze(STALEMATE).json()

        assert body["is_stalemate"] is True
        assert body["verbal_verdict"] == "Game drawn"
        assert body["turn"] == "black"

    def test_material_is_still_counted(self, fake_engine):
        fake_engine()

        assert analyze(STALEMATE).json()["material"] == {"white": 9, "black": 0, "diff": 9}


class TestAnalyzeWithEngine:
    def test_asks_the_engine_for_the_requested_depth_and_lines(self, fake_engine):
        board = chess.Board()
        engine = fake_engine([line(board, ["e4"], pov(cp=30))])

        analyze("  " + START_FEN + "  ", depth=12, multipv=2)

        assert engine.launched["path"] == main.STOCKFISH_PATH
        assert engine.calls == [{"fen": START_FEN, "depth": 12, "multipv": 2}]
        assert engine.configured == {"UCI_ShowWDL": True}

    def test_uses_default_depth_and_lines(self, fake_engine):
        engine = fake_engine([])

        analyze()

        assert engine.calls[0]["depth"] == 16
        assert engine.calls[0]["multipv"] == 3

    def test_builds_one_entry_per_engine_line(self, fake_engine):
        board = chess.Board()
        fake_engine(
            [
                line(board, ["e4", "e5", "Nf3"], pov(cp=35)),
                line(board, ["d4", "d5"], pov(cp=-20)),
            ]
        )

        body = analyze().json()

        first, second = body["lines"]
        assert first == {
            "rank": 1,
            "move_uci": "e2e4",
            "move_san": "e4",
            "score": "+0.35",
            "score_cp": 35,
            "pv_san": ["e4", "e5", "Nf3"],
            "pv_uci": ["e2e4", "e7e5", "g1f3"],
            "explanation": "Pawn moves to e4",
        }
        assert (second["rank"], second["move_san"], second["score"], second["score_cp"]) == (
            2,
            "d4",
            "-0.20",
            -20,
        )

    def test_describes_the_position(self, fake_engine):
        board = chess.Board()
        fake_engine([line(board, ["e4"], pov(cp=250))])

        body = analyze().json()

        assert body["fen"] == START_FEN
        assert body["turn"] == "white"
        assert body["is_check"] is False
        assert body["verbal_verdict"] == "Clear advantage for White"
        assert body["material"] == {"white": 39, "black": 39, "diff": 0}

    def test_shows_scores_from_whites_side_when_black_is_to_move(self, fake_engine):
        fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
        board = chess.Board(fen)
        # Stockfish reports +0.50 for the side to move, which is Black.
        fake_engine([line(board, ["c5"], pov(cp=50, turn=chess.BLACK))])

        body = analyze(fen).json()

        assert body["turn"] == "black"
        assert body["lines"][0]["score"] == "-0.50"
        assert body["lines"][0]["score_cp"] == -50

    def test_limits_the_variation_to_eight_moves(self, fake_engine):
        board = chess.Board()
        moves = ["Nf3", "Nf6", "Ng1", "Ng8"] * 3
        fake_engine([line(board, moves, pov(cp=0))])

        body = analyze().json()

        assert body["lines"][0]["pv_san"] == moves[:8]
        assert len(body["lines"][0]["pv_uci"]) == 8

    def test_stops_the_variation_at_an_illegal_move(self, fake_engine):
        board = chess.Board()
        entry = line(board, ["e4", "e5"], pov(cp=30))
        entry["pv"].append(chess.Move.from_uci("a3a4"))  # no piece stands on a3
        fake_engine([entry])

        body = analyze().json()

        assert body["lines"][0]["pv_san"] == ["e4", "e5"]

    def test_skips_lines_without_moves(self, fake_engine):
        board = chess.Board()
        fake_engine([line(board, ["e4"], pov(cp=30)), {"score": pov(cp=0), "pv": []}])

        assert len(analyze().json()["lines"]) == 1

    def test_accepts_a_single_info_dict(self, fake_engine):
        # With multipv=1 python-chess may hand back one dict instead of a list.
        board = chess.Board()
        fake_engine(line(board, ["e4"], pov(cp=30)))

        assert analyze(multipv=1).json()["lines"][0]["move_san"] == "e4"

    def test_reports_mate_in_the_verdict(self, fake_engine):
        fen = "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1"
        board = chess.Board(fen)
        fake_engine([line(board, ["Ra8#"], pov(mate=1))])

        body = analyze(fen).json()

        assert body["verbal_verdict"] == "White has a forced checkmate in 1 move"
        assert body["lines"][0]["explanation"] == "Rook moves to a8 & delivers check"

    def test_converts_win_draw_loss_to_percentages(self, fake_engine):
        board = chess.Board()
        wdl = chess.engine.PovWdl(chess.engine.Wdl(125, 800, 75), chess.WHITE)
        fake_engine([line(board, ["e4"], pov(cp=30), wdl=wdl)])

        assert analyze().json()["wdl"] == {"win_pct": 12.5, "draw_pct": 80.0, "loss_pct": 7.5}

    def test_wdl_is_shown_from_whites_side(self, fake_engine):
        fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
        board = chess.Board(fen)
        # 60% wins for Black, the side to move.
        wdl = chess.engine.PovWdl(chess.engine.Wdl(600, 300, 100), chess.BLACK)
        fake_engine([line(board, ["c5"], pov(cp=30, turn=chess.BLACK), wdl=wdl)])

        assert analyze(fen).json()["wdl"] == {"win_pct": 10.0, "draw_pct": 30.0, "loss_pct": 60.0}

    def test_leaves_out_an_empty_wdl(self, fake_engine):
        board = chess.Board()
        wdl = chess.engine.PovWdl(chess.engine.Wdl(0, 0, 0), chess.WHITE)
        fake_engine([line(board, ["e4"], pov(cp=30), wdl=wdl)])

        assert analyze().json()["wdl"] is None

    def test_reports_engine_statistics(self, fake_engine):
        board = chess.Board()
        fake_engine(
            [line(board, ["e4"], pov(cp=30), depth=22, nodes=1_500_000, nps=3_000_000, time=0.51234)]
        )

        stats = analyze(depth=22).json()["stats"]

        assert stats == {"depth": 22, "nodes": 1_500_000, "nps": 3_000_000, "time_seconds": 0.512}

    def test_falls_back_to_the_requested_depth(self, fake_engine):
        board = chess.Board()
        fake_engine([line(board, ["e4"], pov(cp=30))])

        stats = analyze(depth=9).json()["stats"]

        assert stats == {"depth": 9, "nodes": None, "nps": None, "time_seconds": None}

    def test_no_lines_means_no_verdict(self, fake_engine):
        fake_engine([])

        body = analyze().json()

        assert body["lines"] == []
        assert body["verbal_verdict"] == "Position analysis unavailable"

    def test_works_with_an_engine_that_has_no_wdl_option(self, fake_engine):
        board = chess.Board()
        fake_engine([line(board, ["e4"], pov(cp=30))], configure_error=chess.engine.EngineError("no"))

        assert analyze().status_code == 200


class TestAnalyzeEngineFailures:
    def test_missing_binary(self, fake_engine):
        fake_engine(launch_error=FileNotFoundError())

        response = analyze()

        assert response.status_code == 500
        assert "Stockfish binary not found" in response.json()["detail"]

    def test_engine_crash(self, fake_engine):
        fake_engine(error=chess.engine.EngineTerminatedError("engine died"))

        response = analyze()

        assert response.status_code == 500
        assert response.json()["detail"] == "Engine analysis failed: engine died"


# ── Gemini commentary ──────────────────────────────────────────────────────────

COMMENTARY_REQUEST = {
    "fen": START_FEN,
    "turn": "white",
    "score": "+0.30",
    "best_move_san": "e4",
    "explanation": "Pawn moves to e4",
    "verbal_verdict": "Even position",
}


def gemini_reply(text="Take the centre."):
    return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": text}]}}]})


def ask(**overrides):
    return client.post("/api/ai-commentary", json={**COMMENTARY_REQUEST, **overrides}).json()


class TestAiCommentary:
    def test_needs_an_api_key(self, gemini):
        body = ask()

        assert body["success"] is False
        assert "Gemini API Key is not configured" in body["error"]
        assert gemini.requests == []

    def test_a_blank_key_counts_as_missing(self, gemini):
        assert ask(custom_api_key="   ")["success"] is False
        assert gemini.requests == []

    def test_returns_the_commentary(self, gemini, monkeypatch):
        monkeypatch.setenv("GEMINI_API_KEY", "server-key")
        gemini.reply(gemini_reply("  Take the centre.  "))

        body = ask()

        assert body == {
            "success": True,
            "commentary": "Take the centre.",
            "model": "gemini-3.8-flash",
            "error": None,
        }

    def test_sends_the_position_in_the_prompt(self, gemini, monkeypatch):
        monkeypatch.setenv("GEMINI_API_KEY", "server-key")
        gemini.reply(gemini_reply())

        ask()

        sent = json.loads(gemini.requests[0].content)
        prompt = sent["contents"][0]["parts"][0]["text"]
        assert START_FEN in prompt
        assert "Turn to move: White" in prompt
        assert "+0.30 (Even position)" in prompt
        assert "Recommended Move: e4 (Pawn moves to e4)" in prompt
        assert sent["generationConfig"] == {"temperature": 0.4, "maxOutputTokens": 1000}

    def test_fills_in_missing_details(self, gemini, monkeypatch):
        monkeypatch.setenv("GEMINI_API_KEY", "server-key")
        gemini.reply(gemini_reply())

        ask(explanation=None, verbal_verdict=None)

        prompt = json.loads(gemini.requests[0].content)["contents"][0]["parts"][0]["text"]
        assert "+0.30 (N/A)" in prompt
        assert "e4 (Positional move)" in prompt

    def test_the_users_key_wins_over_the_servers(self, gemini, monkeypatch):
        monkeypatch.setenv("GEMINI_API_KEY", "server-key")
        gemini.reply(gemini_reply())

        ask(custom_api_key=" user-key ")

        assert gemini.requests[0].url.params["key"] == "user-key"

    def test_uses_the_model_from_the_environment(self, gemini, monkeypatch):
        monkeypatch.setenv("GEMINI_API_KEY", "key")
        monkeypatch.setenv("GEMINI_MODEL", " gemini-test ")
        gemini.reply(gemini_reply())

        body = ask()

        assert gemini.requests[0].url.path == "/v1beta/models/gemini-test:generateContent"
        assert body["model"] == "gemini-test"

    def test_no_candidates(self, gemini, monkeypatch):
        monkeypatch.setenv("GEMINI_API_KEY", "key")
        gemini.reply(httpx.Response(200, json={"candidates": []}))

        body = ask()

        assert body["success"] is False
        assert body["error"] == "Gemini returned no commentary for this position."

    @pytest.mark.parametrize("status", [429, 503])
    def test_retries_a_busy_server_with_growing_pauses(self, gemini, monkeypatch, status):
        monkeypatch.setenv("GEMINI_API_KEY", "key")
        busy = httpx.Response(status, json={"error": {"message": "busy"}})
        gemini.reply(busy, busy, gemini_reply("Finally."))

        body = ask()

        assert body["success"] is True
        assert body["commentary"] == "Finally."
        assert len(gemini.requests) == 3
        assert gemini.sleeps == [2, 4]

    def test_gives_up_after_three_attempts(self, gemini, monkeypatch):
        monkeypatch.setenv("GEMINI_API_KEY", "key")
        gemini.reply(*[httpx.Response(503, text="overloaded") for _ in range(3)])

        body = ask()

        assert body["success"] is False
        assert "temporarily overloaded" in body["error"]
        assert "(Tried 3 times)" in body["error"]
        assert len(gemini.requests) == 3

    def test_does_not_retry_other_errors(self, gemini, monkeypatch):
        monkeypatch.setenv("GEMINI_API_KEY", "key")
        gemini.reply(httpx.Response(400, json={"error": {"message": "API key not valid"}}))

        body = ask()

        assert body["error"] == "Gemini API error (400): API key not valid"
        assert len(gemini.requests) == 1
        assert gemini.sleeps == []

    def test_reports_a_non_json_error_body_as_text(self, gemini, monkeypatch):
        monkeypatch.setenv("GEMINI_API_KEY", "key")
        gemini.reply(httpx.Response(500, text="<html>Internal error</html>"))

        assert ask()["error"] == "Gemini API error (500): <html>Internal error</html>"

    def test_reports_a_network_failure(self, gemini, monkeypatch):
        monkeypatch.setenv("GEMINI_API_KEY", "key")
        gemini.reply(httpx.ConnectError("connection refused"))

        body = ask()

        assert body["success"] is False
        assert body["error"] == (
            "Could not reach the Gemini API (connection refused). Check the internet connection."
        )

    # httpx network errors and timeouts often carry no message at all, which
    # used to produce the bare "Failed to contact Gemini API:".
    def test_explains_a_timeout(self, gemini, monkeypatch):
        monkeypatch.setenv("GEMINI_API_KEY", "key")
        gemini.reply(httpx.ReadTimeout(""))

        body = ask()

        assert body["error"] == (
            "Gemini did not answer within 20 seconds. It may be busy; please try again."
        )

    def test_explains_a_network_failure_without_a_message(self, gemini, monkeypatch):
        monkeypatch.setenv("GEMINI_API_KEY", "key")
        gemini.reply(httpx.ConnectError(""))

        body = ask()

        assert body["error"] == (
            "Could not reach the Gemini API (ConnectError). Check the internet connection."
        )

    def test_names_an_unexpected_error_that_has_no_message(self, gemini, monkeypatch):
        monkeypatch.setenv("GEMINI_API_KEY", "key")
        gemini.reply(RuntimeError())

        assert ask()["error"] == "Failed to contact Gemini API: RuntimeError"


# ── Real engine ────────────────────────────────────────────────────────────────


@pytest.mark.skipif(
    not (shutil.which(main.STOCKFISH_PATH) or main.os.path.isfile(main.STOCKFISH_PATH)),
    reason="Stockfish is not installed",
)
def test_real_stockfish_analyzes_the_starting_position():
    body = analyze(depth=6, multipv=2).json()

    assert len(body["lines"]) == 2
    legal = {move.uci() for move in chess.Board().legal_moves}
    assert {entry["move_uci"] for entry in body["lines"]} <= legal
    assert body["stats"]["depth"] >= 6


class TestCors:
    """The browser normally reaches the API through the Vite proxy (same
    origin), but a page on any local port may call it directly. The frontend
    port is set only in frontend/vite.config.js, so the backend must not
    depend on it."""

    @staticmethod
    def allowed_origin(origin):
        response = client.get("/api/health", headers={"Origin": origin})
        return response.headers.get("access-control-allow-origin")

    @pytest.mark.parametrize(
        "origin",
        ["http://localhost:5180", "http://127.0.0.1:5180", "http://localhost:3000", "http://localhost:4321"],
    )
    def test_allows_a_page_on_any_local_port(self, origin):
        assert self.allowed_origin(origin) == origin

    @pytest.mark.parametrize(
        "origin",
        ["https://evil.example", "http://localhost.evil.example:5180", "http://192.168.1.10:5180"],
    )
    def test_refuses_other_sites(self, origin):
        assert self.allowed_origin(origin) is None
