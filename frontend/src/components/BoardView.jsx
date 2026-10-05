import React, { useState, useEffect } from 'react';
import { Chessboard } from 'react-chessboard';
import { playMoveSound } from '../utils/sound';

export default function BoardView({
  fen,
  bestMove,
  turn,
  onPieceDrop,
  onPlayBestMove,
  isGameOver,
}) {
  const [orientation, setOrientation] = useState('white');
  const [moveFrom, setMoveFrom] = useState(null);
  const [optionSquares, setOptionSquares] = useState({});
  const [showArrow, setShowArrow] = useState(true);

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
    const success = onPieceDrop(sourceSquare, targetSquare, piece);
    if (success) {
      setOptionSquares({});
      setMoveFrom(null);
    }
    return success;
  };

  const toggleOrientation = () => {
    setOrientation((prev) => (prev === 'white' ? 'black' : 'white'));
  };

  return (
    <div className="card board-card">
      <div className="board-header">
        <div className="board-title">
          <span>Interactive Board</span>
          {turn && (
            <span className={`turn-badge ${turn}`}>
              {turn === 'white' ? '⚪ White to move' : '⚫ Black to move'}
            </span>
          )}
        </div>
        <div className="board-header-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={toggleOrientation}
            title="Flip board orientation"
          >
            🔄 Flip ({orientation})
          </button>
        </div>
      </div>

      <div className="board-wrapper">
        <Chessboard
          position={fen || 'start'}
          boardOrientation={orientation}
          arePiecesDraggable={!isGameOver}
          onPieceDrop={handleDrop}
          customArrows={customArrows}
          customSquareStyles={optionSquares}
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
          <span>💡 <em>Drag & drop pieces to play moves — analysis updates automatically!</em></span>
        </div>

        {bestMove && onPlayBestMove && !isGameOver && (
          <button
            type="button"
            className="btn btn-action-play"
            onClick={onPlayBestMove}
            title="Automatically play the top engine move"
          >
            ▶ Play Best Move ({bestMove})
          </button>
        )}
      </div>
    </div>
  );
}
