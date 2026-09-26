#!/usr/bin/env python3
import argparse
import sys

import chess
import chess.engine


def analyze_fen(fen, engine_path, depth=16, multipv=3):
    board = chess.Board(fen)
    if not board.is_valid():
        raise ValueError("Invalid FEN or impossible position")

    with chess.engine.SimpleEngine.popen_uci(engine_path) as engine:
        info = engine.analyse(board, chess.engine.Limit(depth=depth), multipv=multipv)

    if isinstance(info, dict):
        info = [info]

    return board, info


def fmt_score(score):
    if score is None:
        return "n/a"
    try:
        cp = score.white().score(mate_score=100000)
    except Exception:
        cp = None
    if cp is not None:
        return f"{cp / 100:+.2f}"
    mate = score.white().mate()
    if mate is not None:
        return f"mate {mate}"
    return str(score)


def main():
    p = argparse.ArgumentParser(description="Analyze a chess position from FEN using Stockfish")
    p.add_argument("fen", help="FEN string")
    p.add_argument("--engine", default="stockfish", help="Path to Stockfish binary or command in PATH")
    p.add_argument("--depth", type=int, default=16, help="Analysis depth")
    p.add_argument("--multipv", type=int, default=3, help="Number of top lines")
    args = p.parse_args()

    try:
        board, info = analyze_fen(args.fen, args.engine, args.depth, args.multipv)
    except FileNotFoundError:
        print("Stockfish not found. Set --engine to the full path of the binary.", file=sys.stderr)
        sys.exit(2)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(3)

    print("Board:")
    print(board)
    print(f"FEN: {args.fen}")
    print(f"Turn: {'White' if board.turn == chess.WHITE else 'Black'}")
    print("\nTop lines:")

    for i, line in enumerate(info, 1):
        pv = line.get("pv", [])
        move = pv[0].uci() if pv else "n/a"
        san = board.san(pv[0]) if pv else "n/a"
        score = fmt_score(line.get("score"))
        print(f"{i}. {move} ({san}) | score {score}")
        if pv:
            b = board.copy()
            san_moves = []
            for mv in pv[:8]:
                san_moves.append(b.san(mv))
                b.push(mv)
            print("   " + " ".join(san_moves))


if __name__ == "__main__":
    main()
