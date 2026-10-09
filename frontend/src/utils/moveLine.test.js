import { describe, expect, it } from 'vitest';
import { addMove, goTo, moveLabels, shownFen, startLine } from './moveLine';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const E4_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
const E4_C5 = 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
const IMAGE = 'r5k1/1Qp1bppp/1n1qp3/1B1p4/3P2b1/2P1P3/PP1N1PPP/R1B2RK1 b - - 4 19';

const played = () => addMove(addMove(startLine(START), 'e4', E4), 'e5', E4_E5);

describe('moveLine', () => {
  it('starts with no moves, showing the start position', () => {
    const line = startLine(START);

    expect(line).toEqual({ startFen: START, moves: [], index: -1 });
    expect(shownFen(line)).toBe(START);
  });

  it('adds moves and shows the last one', () => {
    const line = played();

    expect(line.moves.map((m) => m.san)).toEqual(['e4', 'e5']);
    expect(line.index).toBe(1);
    expect(shownFen(line)).toBe(E4_E5);
  });

  it('goes back to the start and forward again without losing moves', () => {
    const atStart = goTo(played(), -1);
    expect(shownFen(atStart)).toBe(START);
    expect(atStart.moves).toHaveLength(2);

    expect(shownFen(goTo(atStart, 0))).toBe(E4);
  });

  it('stays within the moves it has', () => {
    expect(goTo(played(), 7).index).toBe(1);
    expect(goTo(played(), -5).index).toBe(-1);
  });

  it('starts a new branch when a move is played from an earlier position', () => {
    const line = addMove(goTo(played(), 0), 'c5', E4_C5);

    expect(line.moves.map((m) => m.san)).toEqual(['e4', 'c5']);
    expect(shownFen(line)).toBe(E4_C5);
  });

  it('numbers moves from the start position', () => {
    expect(moveLabels(played())).toEqual(['1. e4', '1… e5']);
  });

  it('numbers a line that starts with Black to move from its move number', () => {
    const line = addMove(addMove(startLine(IMAGE), 'Qd6', 'x'), 'Bxd6', 'y');

    expect(moveLabels(line)).toEqual(['19… Qd6', '20. Bxd6']);
  });

  it('counts from 1 when the FEN has no move number', () => {
    expect(moveLabels(addMove(startLine('4k3/8/8/8/8/8/8/4K3 w'), 'Kd2', 'x'))).toEqual(['1. Kd2']);
  });
});
