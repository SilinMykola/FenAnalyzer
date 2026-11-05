import React, { useState, useEffect } from 'react';
import { Chessboard } from 'react-chessboard';
import { useT } from '../i18n';
import { playMoveSound } from '../utils/sound';

// Dots on the squares a selected piece can go to, a ring around a piece it
// can take, drawn over the square whatever its color.
const MOVE_DOT = 'radial-gradient(circle, rgba(0, 0, 0, 0.28) 22%, transparent 24%)';
const CAPTURE_RING = 'radial-gradient(circle, transparent 58%, rgba(0, 0, 0, 0.28) 60%)';
const SELECTED_BACKGROUND = 'rgba(255, 255, 0, 0.45)';

function selectionStyles(selected) {
  if (!selected) return {};
  const styles = { [selected.square]: { backgroundColor: SELECTED_BACKGROUND } };
  for (const move of selected.moves) {
    styles[move.to] = {
      background: move.captured ? CAPTURE_RING : MOVE_DOT,
      cursor: 'pointer',
    };
  }
  return styles;
}

/**
 * The board. A move is played by dragging a piece, or by clicking it and then
 * one of the squares marked for it. getLegalMoves(square) gives the moves of
 * the piece on a square, as chess.js lists them.
 */
export default function BoardView({
  fen,
  bestMove,
  turn,
  orientation = 'white',
  onFlip,
  onPieceDrop,
  getLegalMoves = () => [],
  onPlayBestMove,
  isGameOver,
}) {
  const t = useT();
  // The clicked piece: { square, piece, moves }.
  const [selected, setSelected] = useState(null);
  // A pawn clicked to its last rank: { from, to } while the board asks for
  // the piece.
  const [promotion, setPromotion] = useState(null);
  const [showArrow, setShowArrow] = useState(true);

  // A selection belongs to the position it was made in.
  useEffect(() => {
    setSelected(null);
    setPromotion(null);
  }, [fen]);

  // Instantly clear the green arrow whenever fen or orientation changes
  useEffect(() => {
    setShowArrow(false);
  }, [fen, orientation]);

  // Show arrow only when a fresh bestMove is received
  useEffect(() => {
    if (bestMove) {
      setShowArrow(true);
    }
  }, [bestMove]);

  // Extract UCI start and end squares for the best move arrow
  const customArrows = [];
  if (showArrow && bestMove && bestMove.length >= 4) {
    const from = bestMove.slice(0, 2);
    const to = bestMove.slice(2, 4);
    customArrows.push([from, to, 'rgba(34, 197, 94, 0.85)']);
  }

  const handleDrop = (sourceSquare, targetSquare, piece) => {
    if (sourceSquare === targetSquare) return false;
    setShowArrow(false);
    return onPieceDrop(sourceSquare, targetSquare, piece);
  };

  const handleSquareClick = (square, piece) => {
    if (isGameOver) return;
    const move = selected?.moves.find((m) => m.to === square);
    if (move) {
      setSelected(null);
      if (move.promotion) {
        setPromotion({ from: selected.square, to: square });
      } else {
        handleDrop(selected.square, square, selected.piece);
      }
      return;
    }
    const moves = square === selected?.square ? [] : getLegalMoves(square);
    setSelected(moves.length > 0 ? { square, piece, moves } : null);
  };

  // A promotion by drag is left to the board, which passes the piece on to
  // onPieceDrop. One by click was not started by the board, so it is played
  // here; no piece means the dialog was closed.
  const handlePromotionSelect = (piece) => {
    if (!promotion) return true;
    setPromotion(null);
    if (piece) handleDrop(promotion.from, promotion.to, piece);
    return false;
  };

  return (
    <div className="card board-card">
      <div className="board-header">
        <div className="board-title">
          <span>{t('board.title')}</span>
          {turn && (
            <span className={`turn-badge ${turn}`}>
              {t(turn === 'white' ? 'board.turn.white' : 'board.turn.black')}
            </span>
          )}
        </div>
        <div className="board-header-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={onFlip}
            title={t('board.flipHint')}
          >
            {t('board.flip', { side: t(`board.side.${orientation}`) })}
          </button>
        </div>
      </div>

      <div className="board-wrapper">
        <Chessboard
          position={fen || 'start'}
          boardOrientation={orientation}
          arePiecesDraggable={!isGameOver}
          onPieceDrop={handleDrop}
          onPieceDragBegin={() => setSelected(null)}
          onSquareClick={handleSquareClick}
          onPromotionPieceSelect={handlePromotionSelect}
          showPromotionDialog={Boolean(promotion)}
          promotionToSquare={promotion?.to ?? null}
          customArrows={customArrows}
          customSquareStyles={selectionStyles(selected)}
          customBoardStyle={{
            borderRadius: '10px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
          }}
          customDarkSquareStyle={{ backgroundColor: '#779952' }}
          customLightSquareStyle={{ backgroundColor: '#edeed1' }}
          animationDuration={250}
        />
      </div>

      <div className="board-footer-controls">
        <div className="drag-hint">
          <span>💡 <em>{t('board.dragHint')}</em></span>
        </div>

        {bestMove && onPlayBestMove && !isGameOver && (
          <button
            type="button"
            className="btn btn-action-play"
            onClick={onPlayBestMove}
            title={t('board.playBestHint')}
          >
            {t('board.playBest', { move: bestMove })}
          </button>
        )}
      </div>
    </div>
  );
}
