import chess
import chess.engine
import httpx
import pytest

from backend import main


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


@pytest.fixture(autouse=True)
def no_real_secrets(monkeypatch):
    # main.py loads backend/.env on import; keep a real key out of the tests.
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_MODEL", raising=False)


@pytest.fixture
def gemini(monkeypatch):
    """Answers Gemini requests with the responses a test queues up.

    Returns the list of requests sent, so tests can check what went out.
    Retry pauses are skipped and recorded in `gemini.sleeps`.
    """
    requests = []
    replies = []

    def handler(request):
        requests.append(request)
        reply = replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        main.httpx,
        "AsyncClient",
        lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs),
    )

    sleeps = []

    async def fake_sleep(seconds):
        sleeps.append(seconds)

    monkeypatch.setattr(main.asyncio, "sleep", fake_sleep)

    class Gemini:
        def reply(self, *responses):
            replies.extend(responses)

    g = Gemini()
    g.requests = requests
    g.sleeps = sleeps
    return g
