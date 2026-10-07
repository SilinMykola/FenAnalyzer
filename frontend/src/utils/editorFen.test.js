import { describe, expect, it } from 'vitest';
import {
  CASTLING_FLAGS,
  buildFen,
  fenToPosition,
  getPositionError,
  isCastlingPossible,
  parseFenMeta,
  positionToBoardFen,
} from './editorFen';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const START_BOARD = START_FEN.split(' ')[0];
const ALL_RIGHTS = { K: true, Q: true, k: true, q: true };
const NO_RIGHTS = { K: false, Q: false, k: false, q: false };

describe('fenToPosition', () => {
  it('reads every piece of the starting position', () => {
    const position = fenToPosition(START_FEN);

    expect(Object.keys(position)).toHaveLength(32);
    expect(position.e1).toBe('wK');
    expect(position.d8).toBe('bQ');
    expect(position.a2).toBe('wP');
    expect(position.h7).toBe('bP');
    expect(position.e4).toBeUndefined();
  });

  it('accepts only the board part, without the rest of the FEN', () => {
    expect(fenToPosition('4k3/8/8/8/8/8/8/4K3')).toEqual({ e8: 'bK', e1: 'wK' });
  });

  it('returns an empty object for an empty board', () => {
    expect(fenToPosition('8/8/8/8/8/8/8/8 w - - 0 1')).toEqual({});
  });

  it('ignores surrounding whitespace', () => {
    expect(fenToPosition('  4k3/8/8/8/8/8/8/4K3 w - - 0 1  ')).toEqual({ e8: 'bK', e1: 'wK' });
  });

  it.each([
    ['too few ranks', '8/8/8/8/8/8/8', /8 ranks/],
    ['too many ranks', '8/8/8/8/8/8/8/8/8', /8 ranks/],
    ['a short rank', '7/8/8/8/8/8/8/8', /Rank 8 must have 8 squares/],
    ['a long rank', '8/8/8/8/8/8/8/44P', /Rank 1 has too many squares/],
    ['digits that overflow a rank', '8/8/8/8/8/8/8/9', /Unexpected character "9"/],
    ['an unknown piece letter', '8/8/8/8/8/8/8/7X', /Unexpected character "X"/],
  ])('rejects %s', (_, fen, message) => {
    expect(() => fenToPosition(fen)).toThrow(message);
  });
});

describe('positionToBoardFen', () => {
  it('writes the starting position back to its FEN', () => {
    expect(positionToBoardFen(fenToPosition(START_FEN))).toBe(START_BOARD);
  });

  it('writes an empty board as eight runs of eight empty squares', () => {
    expect(positionToBoardFen({})).toBe('8/8/8/8/8/8/8/8');
  });

  it('counts empty squares before, between and after pieces', () => {
    expect(positionToBoardFen({ b1: 'wN', e1: 'wK', h8: 'bR' })).toBe(
      '7r/8/8/8/8/8/8/1N2K3'
    );
  });

  it('round-trips an arbitrary position', () => {
    const board = 'r1b2rk1/2p2ppp/p7/1p6/3P3q/1BP2QP1/PP3P1b/RNB1R2K';
    expect(positionToBoardFen(fenToPosition(board))).toBe(board);
  });
});

describe('isCastlingPossible', () => {
  const start = fenToPosition(START_FEN);

  it.each(CASTLING_FLAGS)('allows %s in the starting position', (flag) => {
    expect(isCastlingPossible(start, flag)).toBe(true);
  });

  it('forbids castling once the king has left its square', () => {
    const { e1, ...withoutKing } = start;
    expect(isCastlingPossible({ ...withoutKing, f1: e1 }, 'K')).toBe(false);
    expect(isCastlingPossible({ ...withoutKing, f1: e1 }, 'Q')).toBe(false);
  });

  it('forbids only the side whose rook has left its square', () => {
    const { h8, ...withoutRook } = start;
    expect(isCastlingPossible(withoutRook, 'k')).toBe(false);
    expect(isCastlingPossible(withoutRook, 'q')).toBe(true);
  });

  it('requires pieces of the right colour on the home squares', () => {
    expect(isCastlingPossible({ e1: 'bK', h1: 'bR' }, 'K')).toBe(false);
  });
});

describe('buildFen', () => {
  it('builds the full starting FEN', () => {
    expect(buildFen(fenToPosition(START_FEN), 'w', ALL_RIGHTS)).toBe(START_FEN);
  });

  it('writes "-" when no castling right is wanted', () => {
    expect(buildFen(fenToPosition(START_FEN), 'b', NO_RIGHTS)).toBe(
      `${START_BOARD} b - - 0 1`
    );
  });

  it('keeps the requested rights in K, Q, k, q order', () => {
    expect(
      buildFen(fenToPosition(START_FEN), 'w', { q: true, K: true, k: false, Q: false })
    ).toBe(`${START_BOARD} w Kq - 0 1`);
  });

  it('drops rights the position cannot support', () => {
    // Only the white king and its h1 rook are home, so only K survives.
    const position = { e1: 'wK', h1: 'wR', e8: 'bK' };
    expect(buildFen(position, 'w', ALL_RIGHTS)).toBe('4k3/8/8/8/8/8/8/4K2R w K - 0 1');
  });
});

describe('parseFenMeta', () => {
  it('reads the side to move and every castling right', () => {
    expect(parseFenMeta(START_FEN)).toEqual({ turn: 'w', castling: ALL_RIGHTS });
  });

  it('reads black to move and a partial set of rights', () => {
    expect(parseFenMeta(`${START_BOARD} b Kq - 0 1`)).toEqual({
      turn: 'b',
      castling: { K: true, Q: false, k: false, q: true },
    });
  });

  it('defaults to white with no rights when the FEN has only a board', () => {
    expect(parseFenMeta(START_BOARD)).toEqual({ turn: 'w', castling: NO_RIGHTS });
  });

  it('treats an unknown side to move as white', () => {
    expect(parseFenMeta(`${START_BOARD} x - - 0 1`).turn).toBe('w');
  });
});

describe('getPositionError', () => {
  it('accepts the starting position', () => {
    expect(getPositionError(START_FEN)).toBeNull();
  });

  it('accepts a bare-kings position', () => {
    expect(getPositionError('4k3/8/8/8/8/8/8/4K3 w - - 0 1')).toBeNull();
  });

  it('asks for both kings on an empty board', () => {
    expect(getPositionError('8/8/8/8/8/8/8/8 w - - 0 1')).toBe(
      'place a white king ♔ and a black king ♚'
    );
  });

  it('asks only for the missing white king', () => {
    expect(getPositionError('4k3/8/8/8/8/8/8/8 w - - 0 1')).toBe('place a white king ♔');
  });

  it('asks only for the missing black king', () => {
    expect(getPositionError('8/8/8/8/8/8/8/4K3 w - - 0 1')).toBe('place a black king ♚');
  });

  it('asks to remove an extra king', () => {
    expect(getPositionError('4k3/8/8/8/8/8/8/K3K3 w - - 0 1')).toBe(
      'keep only one king per side'
    );
  });

  it('asks to move pawns off the edge ranks', () => {
    expect(getPositionError('4k3/8/8/8/8/8/8/P3K3 w - - 0 1')).toBe(
      'move pawns off the first and last ranks'
    );
  });

  it('passes any other chess.js complaint through, without its prefix', () => {
    // A move number of 0 is something the editor never produces itself,
    // but the FEN passed in can come from anywhere.
    expect(getPositionError('4k3/8/8/8/8/8/8/4K3 w - - 0 0')).toBe(
      'fix the FEN (move number must be a positive integer)'
    );
  });

  it('rejects a position where the side not to move is in check', () => {
    // The white rook on e1 already checks the black king, yet it is White to
    // move: Black would have had to make a move that left its own king in check.
    expect(getPositionError('4k3/8/8/8/8/8/8/K3R3 w - - 0 1')).toBe(
      "give Black the move or take Black's king out of check"
    );
  });

  it('accepts the same check when the checked side is the one to move', () => {
    expect(getPositionError('4k3/8/8/8/8/8/8/K3R3 b - - 0 1')).toBeNull();
  });

  it('names White when White is the side left in check', () => {
    expect(getPositionError('k3r3/8/8/8/8/8/8/4K3 b - - 0 1')).toBe(
      "give White the move or take White's king out of check"
    );
  });
});
