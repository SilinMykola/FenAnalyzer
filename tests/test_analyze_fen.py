"""Tests for the command-line script analyze_fen.py."""

import sys

import chess
import pytest

import analyze_fen
from conftest import line, pov

START_FEN = chess.STARTING_FEN


def run_cli(monkeypatch, *args):
    """Runs main() as if called from the shell; returns the exit code (None if it did not exit)."""
    monkeypatch.setattr(sys, "argv", ["analyze_fen.py", *args])
    try:
        analyze_fen.main()
    except SystemExit as exit:
        return exit.code
    return None


class TestFmtScore:
    def test_no_score(self):
        assert analyze_fen.fmt_score(None) == "n/a"

    def test_centipawns_from_whites_side(self):
        assert analyze_fen.fmt_score(pov(cp=-75)) == "-0.75"
        assert analyze_fen.fmt_score(pov(cp=75, turn=chess.BLACK)) == "-0.75"

    @pytest.mark.xfail(strict=True, reason="mate scores never reach the 'mate N' branch")
    def test_mate(self):
        assert analyze_fen.fmt_score(pov(mate=2)) == "mate 2"


class TestAnalyzeFen:
    def test_returns_the_board_and_a_list_of_lines(self, fake_engine):
        board = chess.Board()
        engine = fake_engine(line(board, ["e4"], pov(cp=30)))

        result_board, info = analyze_fen.analyze_fen(START_FEN, "/path/to/sf", depth=8, multipv=1)

        assert result_board.fen() == START_FEN
        assert isinstance(info, list) and len(info) == 1
        assert engine.launched["path"] == "/path/to/sf"
        assert engine.calls == [{"fen": START_FEN, "depth": 8, "multipv": 1}]

    def test_rejects_an_impossible_position(self, fake_engine):
        fake_engine()

        with pytest.raises(ValueError, match="impossible position"):
            analyze_fen.analyze_fen("P3k3/8/8/8/8/8/8/4K3 w - - 0 1", "sf")


class TestMain:
    def test_prints_the_board_and_top_lines(self, fake_engine, monkeypatch, capsys):
        board = chess.Board()
        engine = fake_engine(
            [
                line(board, ["e4", "e5", "Nf3"], pov(cp=35)),
                line(board, ["d4"], pov(cp=20)),
            ]
        )

        code = run_cli(monkeypatch, START_FEN, "--depth", "10", "--multipv", "2", "--engine", "sf")

        out = capsys.readouterr().out
        assert code is None
        assert str(board) in out
        assert "Turn: White" in out
        assert "1. e2e4 (e4) | score +0.35" in out
        assert "   e4 e5 Nf3" in out
        assert "2. d2d4 (d4) | score +0.20" in out
        assert engine.calls[0]["depth"] == 10
        assert engine.calls[0]["multipv"] == 2

    def test_prints_a_line_without_moves(self, fake_engine, monkeypatch, capsys):
        fake_engine([{"score": None, "pv": []}])

        run_cli(monkeypatch, START_FEN)

        assert "1. n/a (n/a) | score n/a" in capsys.readouterr().out

    def test_exits_with_2_when_stockfish_is_missing(self, fake_engine, monkeypatch, capsys):
        fake_engine(launch_error=FileNotFoundError())

        code = run_cli(monkeypatch, START_FEN)

        assert code == 2
        assert "Stockfish not found" in capsys.readouterr().err

    def test_exits_with_3_on_any_other_error(self, fake_engine, monkeypatch, capsys):
        fake_engine()

        code = run_cli(monkeypatch, "not a fen")

        assert code == 3
        assert capsys.readouterr().err.startswith("Error:")
