import { Chess, validateFen } from 'chess.js';

// Board positions in the editor are plain objects keyed by square, using the
// same piece codes react-chessboard expects: { e1: 'wK', e8: 'bK', d2: 'wP' }.
// chess.js is not used as the editor's model because it refuses to hold a
// position without both kings, which makes an empty board impossible.

const FILES = 'abcdefgh';

// Home squares a king and rook must stand on for each castling right.
const CASTLING_SQUARES = {
  K: { king: 'e1', rook: 'h1', color: 'w' },
  Q: { king: 'e1', rook: 'a1', color: 'w' },
  k: { king: 'e8', rook: 'h8', color: 'b' },
  q: { king: 'e8', rook: 'a8', color: 'b' },
};

export const CASTLING_FLAGS = ['K', 'Q', 'k', 'q'];

// 'K' -> 'wK', 'n' -> 'bN'
const fenCharToPiece = (char) =>
  (char === char.toUpperCase() ? 'w' : 'b') + char.toUpperCase();

// 'wK' -> 'K', 'bN' -> 'n'
const pieceToFenChar = (piece) =>
  piece[0] === 'w' ? piece[1] : piece[1].toLowerCase();

/**
 * Parses the board part of a FEN into a position object.
 * Throws if the board part is malformed.
 */
export function fenToPosition(fen) {
  const rows = fen.trim().split(/\s+/)[0].split('/');
  if (rows.length !== 8) throw new Error('FEN board must have 8 ranks');

  const position = {};
  rows.forEach((row, rowIndex) => {
    const rank = 8 - rowIndex;
    let fileIndex = 0;
    for (const char of row) {
      if (/[1-8]/.test(char)) {
        fileIndex += Number(char);
      } else if (/[prnbqk]/i.test(char)) {
        if (fileIndex > 7) throw new Error(`Rank ${rank} has too many squares`);
        position[`${FILES[fileIndex]}${rank}`] = fenCharToPiece(char);
        fileIndex += 1;
      } else {
        throw new Error(`Unexpected character "${char}" in FEN`);
      }
    }
    if (fileIndex !== 8) throw new Error(`Rank ${rank} must have 8 squares`);
  });
  return position;
}

/** Turns a position object back into the board part of a FEN. */
export function positionToBoardFen(position) {
  const rows = [];
  for (let rank = 8; rank >= 1; rank -= 1) {
    let row = '';
    let empty = 0;
    for (const file of FILES) {
      const piece = position[`${file}${rank}`];
      if (piece) {
        if (empty) row += empty;
        row += pieceToFenChar(piece);
        empty = 0;
      } else {
        empty += 1;
      }
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return rows.join('/');
}

/** A castling right only makes sense while its king and rook are at home. */
export function isCastlingPossible(position, flag) {
  const { king, rook, color } = CASTLING_SQUARES[flag];
  return position[king] === `${color}K` && position[rook] === `${color}R`;
}

/**
 * Builds a full FEN. Castling rights the position cannot support are dropped,
 * otherwise the backend rejects the FEN as an impossible position.
 */
export function buildFen(position, turn, castling) {
  const rights = CASTLING_FLAGS.filter(
    (flag) => castling[flag] && isCastlingPossible(position, flag)
  ).join('');
  return `${positionToBoardFen(position)} ${turn} ${rights || '-'} - 0 1`;
}

/** Reads turn and castling flags from a full FEN, with safe defaults. */
export function parseFenMeta(fen) {
  const [, turn = 'w', rights = '-'] = fen.trim().split(/\s+/);
  return {
    turn: turn === 'b' ? 'b' : 'w',
    castling: Object.fromEntries(CASTLING_FLAGS.map((f) => [f, rights.includes(f)])),
  };
}

/**
 * Returns what the user must do before the position can be analyzed,
 * phrased as an instruction, or null when it is fine to send to the engine.
 */
export function getPositionError(fen) {
  // Missing kings are the normal state while building a position from an
  // empty board, so name every missing king at once as an instruction.
  const board = fen.split(' ')[0];
  const missing = [];
  if (!board.includes('K')) missing.push('a white king ♔');
  if (!board.includes('k')) missing.push('a black king ♚');
  if (missing.length) return `place ${missing.join(' and ')}`;

  const result = validateFen(fen);
  if (!result.ok) {
    if (/too many \w+ kings/.test(result.error)) return 'keep only one king per side';
    if (/pawns are on the edge rows/.test(result.error)) {
      return 'move pawns off the first and last ranks';
    }
    return `fix the FEN (${result.error.replace(/^Invalid FEN: /, '')})`;
  }

  // Flip the side to move: if the side that just "moved" is in check,
  // the position could never arise in a real game.
  const [, turn, ...rest] = fen.split(' ');
  const flipped = [board, turn === 'w' ? 'b' : 'w', ...rest].join(' ');
  try {
    if (new Chess(flipped).isCheck()) {
      const inCheck = turn === 'w' ? 'Black' : 'White';
      return `give ${inCheck} the move or take ${inCheck}'s king out of check`;
    }
  } catch {
    // The flipped FEN can fail only on en passant details we never set.
  }
  return null;
}
