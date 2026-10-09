// The moves played on the board since a position was loaded (from a FEN, an
// image, the board editor or a PGN), so the user can step back and forth
// through them and return to the loaded position.
//
// A line is { startFen, moves: [{ san, fen }], index }. index is the move the
// board shows: -1 for the start position, moves.length - 1 for the last move.

/** A line with no moves yet, starting from `fen`. */
export function startLine(fen) {
  return { startFen: fen, moves: [], index: -1 };
}

/**
 * Adds a move played on the shown position. Moves after the shown one are
 * dropped first: playing from an earlier position starts a new branch.
 */
export function addMove(line, san, fen) {
  const moves = [...line.moves.slice(0, line.index + 1), { san, fen }];
  return { ...line, moves, index: moves.length - 1 };
}

/** The line showing move `index` (-1 for the start), kept within bounds. */
export function goTo(line, index) {
  return { ...line, index: Math.max(-1, Math.min(index, line.moves.length - 1)) };
}

/** The FEN of the position the line shows. */
export function shownFen(line) {
  return line.index < 0 ? line.startFen : line.moves[line.index].fen;
}

/**
 * Labels for the moves in scoresheet style, numbered from the start FEN:
 * "19… Qd6", "20. Bxd6", "20… cxd6". A line starting with Black to move
 * begins with "19…".
 */
export function moveLabels(line) {
  const fields = line.startFen.split(' ');
  const blackFirst = fields[1] === 'b';
  const firstNumber = parseInt(fields[5], 10) || 1;
  return line.moves.map((move, i) => {
    const ply = i + (blackFirst ? 1 : 0);
    const number = firstNumber + Math.floor(ply / 2);
    return ply % 2 === 0 ? `${number}. ${move.san}` : `${number}… ${move.san}`;
  });
}
