import { describe, expect, it } from 'vitest';
import { isChess960Pgn, withStandardCastling, withStandardCastlingPgn } from './pgn';

const CHESS960_FEN = 'rbkrnqbn/pppppppp/8/8/8/8/PPPPPPPP/RBKRNQBN w DAda - 0 1';
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('withStandardCastling', () => {
  it('drops castling rights written as rook files', () => {
    expect(withStandardCastling(CHESS960_FEN)).toBe(
      'rbkrnqbn/pppppppp/8/8/8/8/PPPPPPPP/RBKRNQBN w - - 0 1'
    );
  });

  it('drops rook-file rights mixed with standard ones', () => {
    expect(withStandardCastling('4k3/8/8/8/8/8/8/R3K2R w HQ - 0 1')).toBe(
      '4k3/8/8/8/8/8/8/R3K2R w - - 0 1'
    );
  });

  it('keeps standard castling rights', () => {
    expect(withStandardCastling(START_FEN)).toBe(START_FEN);
    expect(withStandardCastling('4k3/8/8/8/8/8/8/R3K2R w Kq - 0 1')).toBe(
      '4k3/8/8/8/8/8/8/R3K2R w Kq - 0 1'
    );
  });

  it('keeps a FEN without castling rights', () => {
    const fen = '4k3/8/8/8/8/8/8/R3K3 b - - 0 1';
    expect(withStandardCastling(fen)).toBe(fen);
  });

  it('leaves a FEN too short to have a castling field alone', () => {
    expect(withStandardCastling('4k3/8/8 w')).toBe('4k3/8/8 w');
  });
});

describe('withStandardCastlingPgn', () => {
  it('rewrites the FEN tag only', () => {
    const pgn = `[Variant "Chess960"]\n[FEN "${CHESS960_FEN}"]\n[initialSetup "${CHESS960_FEN}"]\n\n1. f4 *`;

    expect(withStandardCastlingPgn(pgn)).toBe(
      `[Variant "Chess960"]\n[FEN "rbkrnqbn/pppppppp/8/8/8/8/PPPPPPPP/RBKRNQBN w - - 0 1"]\n` +
        `[initialSetup "${CHESS960_FEN}"]\n\n1. f4 *`
    );
  });

  it('leaves a PGN with a standard FEN tag unchanged', () => {
    const pgn = `[FEN "${START_FEN}"]\n\n1. e4 *`;
    expect(withStandardCastlingPgn(pgn)).toBe(pgn);
  });

  it('leaves a PGN without a FEN tag unchanged', () => {
    expect(withStandardCastlingPgn('1. e4 e5 *')).toBe('1. e4 e5 *');
  });
});

describe('isChess960Pgn', () => {
  it('recognizes the Chess960 variant tag', () => {
    expect(isChess960Pgn('[Variant "Chess960"]\n\n1. e4 *')).toBe(true);
  });

  it('does not take a standard game for Chess960', () => {
    expect(isChess960Pgn('[Event "Casual"]\n\n1. e4 *')).toBe(false);
  });
});
