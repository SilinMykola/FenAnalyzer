"""Unit tests for the pure helper functions in backend/main.py."""

import chess
import chess.engine
import pytest

from backend import main
from conftest import pov


class TestFindStockfish:
    @pytest.fixture(autouse=True)
    def no_stockfish_anywhere(self, monkeypatch):
        monkeypatch.delenv("STOCKFISH_PATH", raising=False)
        monkeypatch.setattr(main.shutil, "which", lambda name: None)
        monkeypatch.setattr(main.os.path, "isfile", lambda path: False)

    def test_prefers_the_path_from_the_environment(self, monkeypatch):
        monkeypatch.setenv("STOCKFISH_PATH", "/custom/stockfish")
        monkeypatch.setattr(main.os.path, "isfile", lambda path: path == "/custom/stockfish")
        monkeypatch.setattr(main.shutil, "which", lambda name: "/usr/bin/stockfish")

        assert main.find_stockfish() == "/custom/stockfish"

    def test_ignores_an_environment_path_that_does_not_exist(self, monkeypatch):
        monkeypatch.setenv("STOCKFISH_PATH", "/missing/stockfish")
        monkeypatch.setattr(main.shutil, "which", lambda name: "/found/on/path")

        assert main.find_stockfish() == "/found/on/path"

    def test_falls_back_to_the_usual_install_locations(self, monkeypatch):
        monkeypatch.setattr(main.os.path, "isfile", lambda path: path == "/usr/local/bin/stockfish")

        assert main.find_stockfish() == "/usr/local/bin/stockfish"

    def test_checks_homebrew_first(self, monkeypatch):
        monkeypatch.setattr(main.os.path, "isfile", lambda path: path.endswith("bin/stockfish"))

        assert main.find_stockfish() == "/opt/homebrew/bin/stockfish"

    def test_returns_the_bare_command_when_nothing_is_found(self):
        assert main.find_stockfish() == "stockfish"


class TestCalculateMaterial:
    def test_starting_position_is_balanced(self):
        material = main.calculate_material(chess.Board())

        assert (material.white, material.black, material.diff) == (39, 39, 0)

    def test_kings_are_not_counted(self):
        material = main.calculate_material(chess.Board("4k3/8/8/8/8/8/8/4K3 w - - 0 1"))

        assert (material.white, material.black, material.diff) == (0, 0, 0)

    def test_white_advantage_is_positive(self):
        # White: Q + R + P = 15, Black: N + B = 6
        board = chess.Board("4k3/8/2nb4/8/8/8/4P3/R2QK3 w - - 0 1")

        material = main.calculate_material(board)

        assert (material.white, material.black, material.diff) == (15, 6, 9)

    def test_black_advantage_is_negative(self):
        board = chess.Board("q3k3/8/8/8/8/8/8/4K3 w - - 0 1")

        assert main.calculate_material(board).diff == -9


class TestFmtScore:
    def test_no_score(self):
        assert main.fmt_score(None) == "0.00"

    @pytest.mark.parametrize(
        "score, expected",
        [
            (pov(cp=45), "+0.45"),
            (pov(cp=0), "+0.00"),
            (pov(cp=-130), "-1.30"),
            # Scores are always shown from White's side, whoever is to move.
            (pov(cp=45, turn=chess.BLACK), "-0.45"),
        ],
    )
    def test_centipawns_are_shown_in_pawns_from_whites_side(self, score, expected):
        assert main.fmt_score(score) == expected

    def test_mate_is_currently_shown_as_a_huge_pawn_count(self):
        # score(mate_score=...) turns a mate into a number, so the "M+2"
        # branch below it is never reached. This pins today's behaviour.
        assert main.fmt_score(pov(mate=2)) == "+999.98"

    @pytest.mark.xfail(strict=True, reason="mate scores never reach the M+N branch; see fmt_score")
    def test_mate_is_shown_as_mate_in_n(self):
        assert main.fmt_score(pov(mate=2)) == "M+2"
        assert main.fmt_score(pov(mate=-3)) == "M-3"


class TestGetVerbalVerdict:
    def test_checkmate_wins_over_any_score(self):
        assert main.get_verbal_verdict(pov(cp=500), True, False) == "Checkmate — game over"

    def test_stalemate(self):
        assert main.get_verbal_verdict(None, False, True) == "Draw by stalemate"

    def test_no_score(self):
        assert main.get_verbal_verdict(None, False, False) == "Position analysis unavailable"

    @pytest.mark.parametrize(
        "mate, expected",
        [
            (1, "White has a forced checkmate in 1 move"),
            (3, "White has a forced checkmate in 3 moves"),
            (-1, "Black has a forced checkmate in 1 move"),
            (-2, "Black has a forced checkmate in 2 moves"),
        ],
    )
    def test_forced_mate(self, mate, expected):
        assert main.get_verbal_verdict(pov(mate=mate), False, False) == expected

    def test_forced_mate_is_told_from_whites_side(self):
        # Black to move with mate in 2 for Black.
        score = pov(mate=2, turn=chess.BLACK)

        assert main.get_verbal_verdict(score, False, False) == "Black has a forced checkmate in 2 moves"

    # Each band boundary in both directions: a pawn is 100 centipawns.
    @pytest.mark.parametrize(
        "cp, expected",
        [
            (401, "Decisive winning advantage for White"),
            (400, "Clear advantage for White"),
            (151, "Clear advantage for White"),
            (150, "Slight advantage for White"),
            (41, "Slight advantage for White"),
            (40, "Even position (balanced game)"),
            (0, "Even position (balanced game)"),
            (-40, "Even position (balanced game)"),
            (-41, "Slight advantage for Black"),
            (-150, "Slight advantage for Black"),
            (-151, "Clear advantage for Black"),
            (-400, "Clear advantage for Black"),
            (-401, "Decisive winning advantage for Black"),
        ],
    )
    def test_evaluation_bands(self, cp, expected):
        assert main.get_verbal_verdict(pov(cp=cp), False, False) == expected


class TestExplainMove:
    @staticmethod
    def explain(fen, san):
        board = chess.Board(fen)
        return main.explain_move(board, board.parse_san(san))

    def test_quiet_move(self):
        assert self.explain(chess.STARTING_FEN, "Nf3") == "Knight moves to f3"

    def test_capture_names_both_pieces(self):
        fen = "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2"

        assert self.explain(fen, "exd5") == "Pawn captures Pawn on d5"

    def test_en_passant(self):
        fen = "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1"

        assert self.explain(fen, "exd6") == "Pawn captures pawn en passant on d6"

    def test_check(self):
        fen = "4k3/8/8/8/8/8/8/R3K3 w - - 0 1"

        assert self.explain(fen, "Ra8+") == "Rook moves to a8 & delivers check"

    def test_capture_with_check(self):
        fen = "3rk3/8/8/8/8/8/8/R2QK3 w - - 0 1"

        assert self.explain(fen, "Qxd8+") == "Queen captures Rook on d8 & delivers check"

    def test_promotion(self):
        fen = "8/P6k/8/8/8/8/8/4K3 w - - 0 1"

        assert self.explain(fen, "a8=N") == "Pawn moves to a8 & promotes to Knight"

    def test_promotion_with_check(self):
        fen = "7k/P7/8/8/8/8/8/4K3 w - - 0 1"

        assert self.explain(fen, "a8=Q+") == "Pawn moves to a8 & promotes to Queen & delivers check"

    def test_kingside_castling(self):
        fen = "4k3/8/8/8/8/8/8/4K2R w K - 0 1"

        assert self.explain(fen, "O-O") == "Castles Kingside (O-O) to tuck king safely"

    def test_queenside_castling(self):
        fen = "r3k3/8/8/8/8/8/8/4K3 b q - 0 1"

        assert self.explain(fen, "O-O-O") == "Castles Queenside (O-O-O) connecting the rooks"
