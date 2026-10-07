import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { chessboardProps } from '../test/mockChessboard';
import { playMoveSound } from '../utils/sound';
import BoardEditor from './BoardEditor';

vi.mock('react-chessboard', () => import('../test/mockChessboard'));
vi.mock('../utils/sound');

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const EMPTY_FEN = '8/8/8/8/8/8/8/8 w - - 0 1';
const KINGS_FEN = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';

function renderEditor(initialFen) {
  const onApplyFen = vi.fn();
  render(<BoardEditor initialFen={initialFen} onApplyFen={onApplyFen} />);
  return { onApplyFen };
}

const fenBox = () => screen.getByRole('textbox');
const analyzeButton = () => screen.getByRole('button', { name: /Analyze this Setup/ });
const palette = (color) => document.querySelector(`.${color}-palette`);
const castlingBox = (label) => screen.getByRole('checkbox', { name: label });

// What the user does on the board, which is a stub in these tests.
const clickSquare = (square) => act(() => chessboardProps().onSquareClick(square));
const dropPiece = (from, to, piece) => act(() => chessboardProps().onPieceDrop(from, to, piece));

describe('BoardEditor setup', () => {
  it('starts from the FEN it is given', () => {
    renderEditor(KINGS_FEN);

    expect(fenBox()).toHaveValue(KINGS_FEN);
    expect(chessboardProps().position).toEqual({ e8: 'bK', e1: 'wK' });
  });

  it('starts from the starting position without a FEN', () => {
    renderEditor(undefined);

    expect(fenBox()).toHaveValue(START_FEN);
  });

  it('starts from the starting pieces when the FEN is broken', () => {
    renderEditor('not a fen');

    // Only the pieces fall back; turn and castling are still read from the
    // broken FEN, so the castling rights come out empty.
    expect(fenBox().value).toMatch(/^rnbqkbnr\/pppppppp\/8\/8\/8\/8\/PPPPPPPP\/RNBQKBNR /);
  });

  it('takes the side to move and castling rights from the FEN', () => {
    renderEditor('r3k2r/8/8/8/8/8/8/R3K2R b Kq - 0 1');

    expect(screen.getByRole('button', { name: /Black to Move/ })).toHaveClass('active');
    expect(castlingBox('White O-O (Kingside)')).toBeChecked();
    expect(castlingBox('White O-O-O (Queenside)')).not.toBeChecked();
    expect(castlingBox('Black O-O (Kingside)')).not.toBeChecked();
    expect(castlingBox('Black O-O-O (Queenside)')).toBeChecked();
  });
});

describe('BoardEditor placing pieces', () => {
  it('places the selected piece on a clicked square', async () => {
    const user = userEvent.setup();
    renderEditor(KINGS_FEN);

    await user.click(screen.getByTitle('Select White Queen'));
    clickSquare('d4');

    expect(chessboardProps().position.d4).toBe('wQ');
    expect(fenBox()).toHaveValue('4k3/8/8/8/3Q4/8/8/4K3 w - - 0 1');
    expect(playMoveSound).toHaveBeenCalled();
  });

  it('keeps the tool selected for several placements', async () => {
    const user = userEvent.setup();
    renderEditor(KINGS_FEN);

    await user.click(screen.getByTitle('Select Black Pawn'));
    clickSquare('a7');
    clickSquare('b7');

    expect(chessboardProps().position).toMatchObject({ a7: 'bP', b7: 'bP' });
  });

  it('moves the king instead of adding a second one', async () => {
    const user = userEvent.setup();
    renderEditor(KINGS_FEN);

    await user.click(screen.getByTitle('Select White King'));
    clickSquare('g1');

    expect(chessboardProps().position).toEqual({ e8: 'bK', g1: 'wK' });
  });

  it('highlights the selected tool and deselects it on a second click', async () => {
    const user = userEvent.setup();
    renderEditor(KINGS_FEN);
    const rook = screen.getByTitle('Select White Rook');

    await user.click(rook);
    expect(rook).toHaveClass('active');

    await user.click(rook);
    expect(rook).not.toHaveClass('active');
  });

  it('removes a piece with the eraser', async () => {
    const user = userEvent.setup();
    renderEditor(START_FEN);

    await user.click(within(palette('white')).getByTitle(/Eraser/));
    clickSquare('d2');

    expect(chessboardProps().position.d2).toBeUndefined();
  });

  it('highlights the eraser in both palettes', async () => {
    const user = userEvent.setup();
    renderEditor(START_FEN);

    await user.click(within(palette('black')).getByTitle(/Eraser/));

    for (const eraser of screen.getAllByTitle(/Eraser/)) {
      expect(eraser).toHaveClass('active');
    }
  });

  it('removes a piece on a click with no tool selected', () => {
    renderEditor(START_FEN);

    clickSquare('g1');

    expect(chessboardProps().position.g1).toBeUndefined();
  });

  it('does nothing on a click on an empty square with no tool', () => {
    renderEditor(KINGS_FEN);

    clickSquare('d4');

    expect(fenBox()).toHaveValue(KINGS_FEN);
    expect(playMoveSound).not.toHaveBeenCalled();
  });

  it('moves a dragged piece', () => {
    renderEditor(START_FEN);

    let accepted;
    act(() => {
      accepted = chessboardProps().onPieceDrop('g1', 'f3', 'wN');
    });

    expect(accepted).toBe(true);
    expect(chessboardProps().position).toMatchObject({ f3: 'wN' });
    expect(chessboardProps().position.g1).toBeUndefined();
  });

  it('replaces a piece a dragged piece lands on', () => {
    renderEditor(START_FEN);

    dropPiece('d1', 'd7', 'wQ');

    expect(chessboardProps().position.d7).toBe('wQ');
  });
});

describe('BoardEditor board buttons', () => {
  it('clears the board', async () => {
    const user = userEvent.setup();
    renderEditor(START_FEN);

    await user.click(screen.getByRole('button', { name: /Clear Board/ }));

    expect(chessboardProps().position).toEqual({});
    // Castling rights cannot survive an empty board.
    expect(fenBox()).toHaveValue(EMPTY_FEN);
  });

  it('restores the starting position, side to move and castling', async () => {
    const user = userEvent.setup();
    renderEditor('4k3/8/8/8/8/8/8/4K3 b - - 0 1');

    await user.click(screen.getByRole('button', { name: /Starting Position/ }));

    expect(fenBox()).toHaveValue(START_FEN);
  });

  it('flips the board and swaps the palettes with it', async () => {
    const user = userEvent.setup();
    renderEditor(START_FEN);
    const palettes = () =>
      [...document.querySelectorAll('.piece-palette')].map((p) => p.className);

    expect(chessboardProps().boardOrientation).toBe('white');
    expect(palettes()).toEqual(['piece-palette black-palette', 'piece-palette white-palette']);

    await user.click(screen.getByRole('button', { name: /Flip Board/ }));

    expect(chessboardProps().boardOrientation).toBe('black');
    expect(palettes()).toEqual(['piece-palette white-palette', 'piece-palette black-palette']);
  });
});

describe('BoardEditor turn and castling', () => {
  it('switches the side to move', async () => {
    const user = userEvent.setup();
    renderEditor(KINGS_FEN);

    await user.click(screen.getByRole('button', { name: /Black to Move/ }));
    expect(fenBox()).toHaveValue('4k3/8/8/8/8/8/8/4K3 b - - 0 1');

    await user.click(screen.getByRole('button', { name: /White to Move/ }));
    expect(fenBox()).toHaveValue(KINGS_FEN);
  });

  it('toggles a castling right', async () => {
    const user = userEvent.setup();
    renderEditor(START_FEN);

    await user.click(castlingBox('White O-O (Kingside)'));

    expect(fenBox()).toHaveValue(START_FEN.replace('KQkq', 'Qkq'));
  });

  it('disables castling once the rook has left its square', () => {
    renderEditor(START_FEN);

    dropPiece('h1', 'h3', 'wR');

    expect(castlingBox('White O-O (Kingside)')).toBeDisabled();
    expect(castlingBox('White O-O-O (Queenside)')).toBeEnabled();
    expect(fenBox().value).toContain(' w Qkq ');
  });

  it('brings a castling right back when the rook returns', () => {
    renderEditor(START_FEN);

    dropPiece('h1', 'h3', 'wR');
    dropPiece('h3', 'h1', 'wR');

    expect(castlingBox('White O-O (Kingside)')).toBeChecked();
  });
});

describe('BoardEditor FEN box', () => {
  it('loads a FEN typed or pasted into it', () => {
    renderEditor(START_FEN);

    fireEvent.change(fenBox(), { target: { value: 'r3k3/8/8/8/8/8/8/4K3 b q - 0 1' } });

    expect(chessboardProps().position).toEqual({ a8: 'bR', e8: 'bK', e1: 'wK' });
    expect(screen.getByRole('button', { name: /Black to Move/ })).toHaveClass('active');
    expect(castlingBox('Black O-O-O (Queenside)')).toBeChecked();
  });

  it('keeps a half-typed FEN in the box without touching the board', () => {
    renderEditor(KINGS_FEN);

    fireEvent.change(fenBox(), { target: { value: '4k3/8/8' } });

    expect(fenBox()).toHaveValue('4k3/8/8');
    expect(chessboardProps().position).toEqual({ e8: 'bK', e1: 'wK' });
  });

  it('shows the generated FEN again when the box loses focus', () => {
    renderEditor(KINGS_FEN);

    fireEvent.change(fenBox(), { target: { value: '4k3/8/8' } });
    fireEvent.blur(fenBox());

    expect(fenBox()).toHaveValue(KINGS_FEN);
  });

  it('copies the FEN and confirms it for two seconds', async () => {
    vi.useFakeTimers();
    try {
      const writeText = vi.fn().mockResolvedValue();
      vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({ writeText });
      renderEditor(KINGS_FEN);

      // fireEvent rather than userEvent: user-event waits on real timers.
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Copy FEN/ }));
      });

      expect(writeText).toHaveBeenCalledWith(KINGS_FEN);
      expect(screen.getByRole('button', { name: /Copied!/ })).toBeInTheDocument();

      act(() => vi.advanceTimersByTime(2000));
      expect(screen.getByRole('button', { name: /Copy FEN/ })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('warns instead of failing when copying is not allowed', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({ writeText });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderEditor(KINGS_FEN);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Copy FEN/ }));
    });

    expect(warn).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Copied!/ })).not.toBeInTheDocument();
  });
});

describe('BoardEditor validation and analysis', () => {
  it('sends a legal position to the engine', async () => {
    const user = userEvent.setup();
    const { onApplyFen } = renderEditor(KINGS_FEN);

    await user.click(analyzeButton());

    expect(onApplyFen).toHaveBeenCalledWith(KINGS_FEN);
  });

  it('explains what is missing and blocks the analysis', () => {
    renderEditor(EMPTY_FEN);

    expect(screen.getByText('place a white king ♔ and a black king ♚')).toBeInTheDocument();
    expect(analyzeButton()).toBeDisabled();
  });

  it('lifts the block once the position becomes legal', async () => {
    const user = userEvent.setup();
    renderEditor('4k3/8/8/8/8/8/8/8 w - - 0 1');
    expect(analyzeButton()).toBeDisabled();

    await user.click(screen.getByTitle('Select White King'));
    clickSquare('e1');

    expect(screen.queryByText(/To analyze this position/)).not.toBeInTheDocument();
    expect(analyzeButton()).toBeEnabled();
  });
});
