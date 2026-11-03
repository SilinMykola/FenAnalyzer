import { describe, expect, it } from 'vitest';
import { classifyPastedText } from './pastedText';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('classifyPastedText', () => {
  it('takes a full FEN as a position', () => {
    expect(classifyPastedText(`  ${START_FEN}\n`)).toEqual({ kind: 'fen', text: START_FEN });
  });

  it('completes a bare piece placement to a full FEN, White to move', () => {
    expect(classifyPastedText('8/8/5k2/R7/4P3/8/5K2/8')).toEqual({
      kind: 'fen',
      text: '8/8/5k2/R7/4P3/8/5K2/8 w - - 0 1',
    });
    expect(classifyPastedText('8/8/5k2/R7/4P3/8/5K2/8 b').text).toBe('8/8/5k2/R7/4P3/8/5K2/8 b - - 0 1');
  });

  it('takes a game with headers as a game', () => {
    const pgn = '[Event "Casual"]\n[White "Alice"]\n\n1. e4 e5 2. Nf3 *';

    expect(classifyPastedText(pgn)).toEqual({ kind: 'pgn', text: pgn });
  });

  it('takes bare moves as a game', () => {
    expect(classifyPastedText('1. e4 e5 2. Nf3 Nc6 3. Bb5')).toEqual({
      kind: 'pgn',
      text: '1. e4 e5 2. Nf3 Nc6 3. Bb5',
    });
  });

  it('takes a game that starts from a FEN header as a game, not a position', () => {
    const pgn = `[SetUp "1"]\n[FEN "${START_FEN}"]\n\n1. d4 *`;

    expect(classifyPastedText(pgn).kind).toBe('pgn');
  });

  it('takes moves written in any usual way as a game', () => {
    for (const pgn of ['1.e4 e5', '1. Nf3 d5', '1... e5 2. Nf3', '{Opening} 1. e4 *', '1. O-O-O']) {
      expect(classifyPastedText(pgn)?.kind).toBe('pgn');
    }
  });

  it('does not take a version number or a numbered list for a game', () => {
    expect(classifyPastedText('Version 1.2 released')).toBeNull();
    expect(classifyPastedText('Steps:\n1. Open the app')).toBeNull();
  });

  it('leaves other text alone', () => {
    expect(classifyPastedText('hello there')).toBeNull();
    expect(classifyPastedText('https://lichess.org/abc123')).toBeNull();
    expect(classifyPastedText('   ')).toBeNull();
    expect(classifyPastedText(undefined)).toBeNull();
  });
});
