// A FEN's piece placement: eight ranks of pieces and digits.
const PLACEMENT = /^([pnbrqkPNBRQK1-8]+\/){7}[pnbrqkPNBRQK1-8]+(\s|$)/;
// A PGN: a header tag like [Event "..."], or move text that starts with 1.
// and a real move (1. e4, 1.Nf3, 1... e5, 1. O-O), so "Version 1.2" or a
// numbered list is not taken for a game.
const PGN =
  /^\s*\[\w+\s+"|(^|\s)1\.(\.\.)?\s*([KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](=[QRBN])?|O-O(-O)?)[+#!?]*(\s|$)/;
// What a bare placement lacks: side to move, castling, en passant, clocks.
const FEN_DEFAULTS = ['w', '-', '-', '0', '1'];

/**
 * What a text pasted onto the page holds: { kind: 'fen' | 'pgn', text }, or
 * null for anything else. It only tells the two apart; whether the position
 * or the game is valid is for loading it to find out. A FEN missing its last
 * fields (a bare piece placement) is completed with White to move.
 */
export function classifyPastedText(raw) {
  const text = (raw || '').trim();
  if (!text) return null;
  if (PGN.test(text)) return { kind: 'pgn', text };
  if (PLACEMENT.test(text)) {
    const fields = text.split(/\s+/);
    return { kind: 'fen', text: [...fields, ...FEN_DEFAULTS.slice(fields.length - 1)].join(' ') };
  }
  return null;
}
