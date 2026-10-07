import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { chessboardProps } from '../test/mockChessboard';
import BoardView from './BoardView';

// vi.mock replaces a module for every import in this test file, including the
// imports inside BoardView itself. Vitest hoists these calls above the imports.
vi.mock('react-chessboard', () => import('../test/mockChessboard'));
vi.mock('../utils/sound');

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

const GREEN_ARROW = 'rgba(34, 197, 94, 0.85)';

function renderBoard(props = {}) {
  const onPieceDrop = vi.fn(() => true);
  const onPlayBestMove = vi.fn();
  const utils = render(
    <BoardView
      fen={START_FEN}
      turn="white"
      onPieceDrop={onPieceDrop}
      onPlayBestMove={onPlayBestMove}
      {...props}
    />
  );
  return { ...utils, onPieceDrop, onPlayBestMove };
}

describe('BoardView', () => {
  it('shows the given position', () => {
    renderBoard();

    expect(chessboardProps().position).toBe(START_FEN);
  });

  it('falls back to the starting position without a FEN', () => {
    renderBoard({ fen: '' });

    expect(chessboardProps().position).toBe('start');
  });

  it('shows whose turn it is', () => {
    const { rerender } = renderBoard({ turn: 'white' });
    expect(screen.getByText('⚪ White to move')).toBeInTheDocument();

    rerender(<BoardView fen={AFTER_E4} turn="black" onPieceDrop={vi.fn()} />);
    expect(screen.getByText('⚫ Black to move')).toBeInTheDocument();
  });

  it('flips the board and back', async () => {
    const user = userEvent.setup();
    renderBoard();

    await user.click(screen.getByRole('button', { name: /Flip \(white\)/ }));
    expect(chessboardProps().boardOrientation).toBe('black');

    await user.click(screen.getByRole('button', { name: /Flip \(black\)/ }));
    expect(chessboardProps().boardOrientation).toBe('white');
  });

  it('draws the best move as a green arrow', () => {
    renderBoard({ bestMove: 'e2e4' });

    expect(chessboardProps().customArrows).toEqual([['e2', 'e4', GREEN_ARROW]]);
  });

  it('draws a promotion move by its from and to squares', () => {
    renderBoard({ bestMove: 'a7a8q' });

    expect(chessboardProps().customArrows).toEqual([['a7', 'a8', GREEN_ARROW]]);
  });

  it('draws no arrow without a best move', () => {
    renderBoard({ bestMove: null });

    expect(chessboardProps().customArrows).toEqual([]);
  });

  it('removes the arrow as soon as the position changes', () => {
    const { rerender } = renderBoard({ bestMove: 'e2e4' });

    // Same best move, new position: the old arrow no longer belongs to the board.
    rerender(<BoardView fen={AFTER_E4} bestMove="e2e4" onPieceDrop={vi.fn()} />);

    expect(chessboardProps().customArrows).toEqual([]);
  });

  it('draws the arrow again once a new best move arrives', () => {
    const { rerender } = renderBoard({ bestMove: 'e2e4' });
    rerender(<BoardView fen={AFTER_E4} bestMove="e2e4" onPieceDrop={vi.fn()} />);

    rerender(<BoardView fen={AFTER_E4} bestMove="e7e5" onPieceDrop={vi.fn()} />);

    expect(chessboardProps().customArrows).toEqual([['e7', 'e5', GREEN_ARROW]]);
  });

  it('passes a dropped piece on and returns whether the move was accepted', () => {
    const { onPieceDrop } = renderBoard();

    let accepted;
    act(() => {
      accepted = chessboardProps().onPieceDrop('e2', 'e4', 'wP');
    });

    expect(onPieceDrop).toHaveBeenCalledWith('e2', 'e4', 'wP');
    expect(accepted).toBe(true);
  });

  it('reports a rejected move back to the board', () => {
    const { onPieceDrop } = renderBoard();
    onPieceDrop.mockReturnValue(false);

    let accepted;
    act(() => {
      accepted = chessboardProps().onPieceDrop('e2', 'e5', 'wP');
    });

    expect(accepted).toBe(false);
  });

  it('ignores a piece dropped back on its own square', () => {
    const { onPieceDrop } = renderBoard();

    let accepted;
    act(() => {
      accepted = chessboardProps().onPieceDrop('e2', 'e2', 'wP');
    });

    expect(accepted).toBe(false);
    expect(onPieceDrop).not.toHaveBeenCalled();
  });

  it('hides the arrow while a dragged move is being processed', () => {
    renderBoard({ bestMove: 'e2e4' });

    act(() => {
      chessboardProps().onPieceDrop('d2', 'd4', 'wP');
    });

    expect(chessboardProps().customArrows).toEqual([]);
  });

  it('plays the best move from its button', async () => {
    const user = userEvent.setup();
    const { onPlayBestMove } = renderBoard({ bestMove: 'e2e4' });

    await user.click(screen.getByRole('button', { name: /Play Best Move \(e2e4\)/ }));

    expect(onPlayBestMove).toHaveBeenCalledTimes(1);
  });

  it('offers no best move button without a best move', () => {
    renderBoard({ bestMove: null });

    expect(screen.queryByRole('button', { name: /Play Best Move/ })).not.toBeInTheDocument();
  });

  it('freezes the board once the game is over', () => {
    renderBoard({ bestMove: 'e2e4', isGameOver: true });

    expect(chessboardProps().arePiecesDraggable).toBe(false);
    expect(screen.queryByRole('button', { name: /Play Best Move/ })).not.toBeInTheDocument();
  });

  it('lets pieces be dragged while the game is on', () => {
    renderBoard({ isGameOver: false });

    expect(chessboardProps().arePiecesDraggable).toBe(true);
  });
});
