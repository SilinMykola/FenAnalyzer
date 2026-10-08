// Chess.com exports Chess960 games with their starting position in a FEN tag
// whose castling field names the rooks' files (Shredder-FEN, e.g. "DAda").
// chess.js accepts only KQkq there and rejects the whole PGN, and it cannot
// play Chess960 castling anyway. Such a field is replaced with "-", so a game
// in which nobody castles loads, without castling rights.

const FEN_TAG = /(\[FEN\s+")([^"]*)("\])/i;
const STANDARD_CASTLING = /^(-|K?Q?k?q?)$/;

/**
 * Returns the FEN with a castling field chess.js cannot read replaced by "-".
 * A FEN with standard castling (KQkq or "-") is returned unchanged.
 */
export function withStandardCastling(fen) {
  const fields = fen.trim().split(/\s+/);
  if (fields.length < 3 || STANDARD_CASTLING.test(fields[2])) return fen;
  fields[2] = '-';
  return fields.join(' ');
}

/**
 * Returns the PGN with its FEN tag, if any, passed through withStandardCastling.
 */
export function withStandardCastlingPgn(pgn) {
  return pgn.replace(FEN_TAG, (_, open, fen, close) => open + withStandardCastling(fen) + close);
}

/**
 * Tells whether the PGN declares itself a Chess960 game.
 */
export function isChess960Pgn(pgn) {
  return /\[Variant\s+"Chess\s*960"\]/i.test(pgn);
}
