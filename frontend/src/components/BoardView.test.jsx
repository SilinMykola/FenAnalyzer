import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { chessboardProps } from '../test/mockChessboard';
import { I18nProvider } from '../i18n';
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

describe('BoardView moving by clicks', () => {
  const E2_MOVES = [{ to: 'e3' }, { to: 'e4' }, { to: 'd3', captured: 'p' }];
  const legalMoves = (square) => (square === 'e2' ? E2_MOVES : square === 'g1' ? [{ to: 'f3' }] : []);
  const click = (square, piece) => act(() => chessboardProps().onSquareClick(square, piece));
  const styles = () => chessboardProps().customSquareStyles;

  it('marks the moves of a clicked piece: dots, and a ring around what it takes', () => {
    renderBoard({ getLegalMoves: legalMoves });

    click('e2', 'wP');

    expect(styles().e2.backgroundColor).toBeTruthy();
    expect(styles().e3.background).toMatch(/rgba\(0, 0, 0, 0.28\) 22%/);
    expect(styles().e4.background).toBe(styles().e3.background);
    expect(styles().d3.background).toMatch(/transparent 58%/);
    expect(Object.keys(styles())).toHaveLength(4);
  });

  it('plays the move when a marked square is clicked', () => {
    const { onPieceDrop } = renderBoard({ getLegalMoves: legalMoves });

    click('e2', 'wP');
    click('e4');

    expect(onPieceDrop).toHaveBeenCalledWith('e2', 'e4', 'wP');
    expect(styles()).toEqual({});
  });

  it('passes on the moving piece, not the one it takes', () => {
    const { onPieceDrop } = renderBoard({ getLegalMoves: legalMoves });

    click('e2', 'wP');
    click('d3', 'bP');

    expect(onPieceDrop).toHaveBeenCalledWith('e2', 'd3', 'wP');
  });

  it('marks nothing and plays nothing for a piece without moves', () => {
    const { onPieceDrop } = renderBoard({ getLegalMoves: legalMoves });

    click('a7', 'bP');
    click('a6');

    expect(styles()).toEqual({});
    expect(onPieceDrop).not.toHaveBeenCalled();
  });

  it('moves the selection to another piece, and drops it on a second click', () => {
    const { onPieceDrop } = renderBoard({ getLegalMoves: legalMoves });

    click('e2', 'wP');
    click('g1', 'wN');
    expect(Object.keys(styles()).sort()).toEqual(['f3', 'g1']);

    click('g1', 'wN');
    expect(styles()).toEqual({});
    expect(onPieceDrop).not.toHaveBeenCalled();
  });

  it('drops the selection on a click elsewhere, when a drag begins and when the position changes', () => {
    const { rerender } = renderBoard({ getLegalMoves: legalMoves });

    click('e2', 'wP');
    click('a5');
    expect(styles()).toEqual({});

    click('e2', 'wP');
    act(() => chessboardProps().onPieceDragBegin('wP', 'e2'));
    expect(styles()).toEqual({});

    click('e2', 'wP');
    rerender(<BoardView fen={AFTER_E4} turn="black" onPieceDrop={vi.fn()} getLegalMoves={legalMoves} />);
    expect(styles()).toEqual({});
  });

  it('selects nothing when the board is locked', () => {
    renderBoard({ getLegalMoves: legalMoves, isGameOver: true });

    click('e2', 'wP');

    expect(styles()).toEqual({});
  });

  describe('promoting', () => {
    const toPromote = () => [{ to: 'e8', promotion: 'q' }, { to: 'e8', promotion: 'n' }];

    it('asks for the piece, then plays the move with it', () => {
      const { onPieceDrop } = renderBoard({ getLegalMoves: toPromote });

      click('e7', 'wP');
      click('e8');
      expect(chessboardProps().showPromotionDialog).toBe(true);
      expect(chessboardProps().promotionToSquare).toBe('e8');
      expect(onPieceDrop).not.toHaveBeenCalled();

      let answer;
      act(() => {
        answer = chessboardProps().onPromotionPieceSelect('wN');
      });

      expect(onPieceDrop).toHaveBeenCalledWith('e7', 'e8', 'wN');
      // The board must not place the piece on its own as well.
      expect(answer).toBe(false);
      expect(chessboardProps().showPromotionDialog).toBe(false);
    });

    it('plays nothing when the dialog is closed', () => {
      const { onPieceDrop } = renderBoard({ getLegalMoves: toPromote });

      click('e7', 'wP');
      click('e8');
      act(() => chessboardProps().onPromotionPieceSelect());

      expect(onPieceDrop).not.toHaveBeenCalled();
      expect(chessboardProps().showPromotionDialog).toBe(false);
    });

    it('leaves a promotion by drag to the board', () => {
      renderBoard();

      expect(chessboardProps().onPromotionPieceSelect('wN', 'e7', 'e8')).toBe(true);
    });
  });
});

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

  it('shows the board from the given side', () => {
    renderBoard({ orientation: 'black' });

    expect(chessboardProps().boardOrientation).toBe('black');
    expect(screen.getByRole('button', { name: /Flip \(black\)/ })).toBeInTheDocument();
  });

  it('shows the board from White by default', () => {
    renderBoard();

    expect(chessboardProps().boardOrientation).toBe('white');
  });

  it('asks for a flip from its button', async () => {
    const user = userEvent.setup();
    const onFlip = vi.fn();
    renderBoard({ onFlip });

    await user.click(screen.getByRole('button', { name: /Flip \(white\)/ }));

    expect(onFlip).toHaveBeenCalledTimes(1);
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

  it('speaks German inside a German provider', () => {
    render(
      <I18nProvider initialLanguage="de">
        <BoardView
          fen={AFTER_E4}
          turn="black"
          orientation="black"
          bestMove="e7e5"
          onPieceDrop={vi.fn()}
          onPlayBestMove={vi.fn()}
        />
      </I18nProvider>
    );

    expect(screen.getByText('Interaktives Brett')).toBeInTheDocument();
    expect(screen.getByText('⚫ Schwarz am Zug')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '🔄 Drehen (Schwarz unten)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '▶ Besten Zug spielen (e7e5)' })).toBeInTheDocument();
  });
});
