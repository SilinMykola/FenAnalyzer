import chess
import chess.engine
import pytest


class FakeEngine:
    """Stands in for a Stockfish process: answers analyse() with prepared info.

    Records how it was configured and called, so tests can check what the code
    asked the engine for.
    """

    def __init__(self, info, error=None, configure_error=None):
        self.info = info
        self.error = error
        self.configure_error = configure_error
        self.configured = {}
        self.calls = []

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def configure(self, options):
        if self.configure_error:
            raise self.configure_error
        self.configured.update(options)

    def analyse(self, board, limit, multipv=None):
        self.calls.append({"fen": board.fen(), "depth": limit.depth, "multipv": multipv})
        if self.error:
            raise self.error
        return self.info


@pytest.fixture
def fake_engine(monkeypatch):
    """Replaces SimpleEngine.popen_uci; call it with the info the engine returns."""
    launched = {}

    def install(info=None, error=None, launch_error=None, configure_error=None):
        engine = FakeEngine(info if info is not None else [], error, configure_error)

        def popen_uci(path):
            launched["path"] = path
            if launch_error:
                raise launch_error
            return engine

        monkeypatch.setattr(chess.engine.SimpleEngine, "popen_uci", popen_uci)
        engine.launched = launched
        return engine

    return install


def pov(cp=None, mate=None, turn=chess.WHITE):
    """A PovScore as Stockfish reports it, from the point of view of `turn`."""
    score = chess.engine.Mate(mate) if mate is not None else chess.engine.Cp(cp)
    return chess.engine.PovScore(score, turn)


def line(board, sans, score, **extra):
    """One MultiPV entry: the given moves (in SAN) played from `board`."""
    temp = board.copy()
    pv = []
    for san in sans:
        move = temp.parse_san(san)
        pv.append(move)
        temp.push(move)
    return {"pv": pv, "score": score, **extra}
