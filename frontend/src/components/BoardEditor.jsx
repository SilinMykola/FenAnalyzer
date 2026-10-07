import React, { useState } from 'react';
import { Chessboard } from 'react-chessboard';
import { playMoveSound } from '../utils/sound';
import {
  buildFen,
  fenToPosition,
  getPositionError,
  isCastlingPossible,
  parseFenMeta,
} from '../utils/editorFen';

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const ALL_CASTLING = { K: true, Q: true, k: true, q: true };

const WHITE_PIECES = [
  { code: 'wK', symbol: '♔', label: 'King' },
  { code: 'wQ', symbol: '♕', label: 'Queen' },
  { code: 'wR', symbol: '♖', label: 'Rook' },
  { code: 'wB', symbol: '♗', label: 'Bishop' },
  { code: 'wN', symbol: '♘', label: 'Knight' },
  { code: 'wP', symbol: '♙', label: 'Pawn' },
];

const BLACK_PIECES = [
  { code: 'bK', symbol: '♚', label: 'King' },
  { code: 'bQ', symbol: '♛', label: 'Queen' },
  { code: 'bR', symbol: '♜', label: 'Rook' },
  { code: 'bB', symbol: '♝', label: 'Bishop' },
  { code: 'bN', symbol: '♞', label: 'Knight' },
  { code: 'bP', symbol: '♟', label: 'Pawn' },
];

// Places a piece on a square. A side has only one king, so placing a king
// moves the existing one instead of adding a second.
function placePiece(position, square, piece) {
  const next = { ...position };
  if (piece[1] === 'K') {
    for (const [sq, p] of Object.entries(next)) {
      if (p === piece) delete next[sq];
    }
  }
  next[square] = piece;
  return next;
}

function initialPosition(fen) {
  try {
    return fenToPosition(fen);
  } catch {
    return fenToPosition(STARTING_FEN);
  }
}

export default function BoardEditor({ onApplyFen, initialFen }) {
  // The editor's source of truth: pieces, side to move and castling wishes.
  // The FEN is derived from these on every render, never stored separately.
  const [position, setPosition] = useState(() => initialPosition(initialFen || STARTING_FEN));
  const [turn, setTurn] = useState(() => parseFenMeta(initialFen || STARTING_FEN).turn);
  const [castling, setCastling] = useState(() => parseFenMeta(initialFen || STARTING_FEN).castling);
  const [selectedTool, setSelectedTool] = useState(null); // piece code ('wK'), 'trash' or null
  // Text the user is typing into the FEN box; null when they are not editing it.
  const [fenDraft, setFenDraft] = useState(null);
  const [copied, setCopied] = useState(false);
  // Which side is shown at the bottom of the board.
  const [orientation, setOrientation] = useState('white');

  const fen = buildFen(position, turn, castling);
  const positionError = getPositionError(fen);

  const handleSquareClick = (square) => {
    if (selectedTool && selectedTool !== 'trash') {
      setPosition((prev) => placePiece(prev, square, selectedTool));
    } else if (position[square]) {
      // The eraser, or a click with no tool selected, removes the piece.
      setPosition((prev) => {
        const next = { ...prev };
        delete next[square];
        return next;
      });
    } else {
      return;
    }
    playMoveSound(false);
  };

  const handlePieceDrop = (sourceSquare, targetSquare, piece) => {
    setPosition((prev) => {
      const next = { ...prev };
      delete next[sourceSquare];
      return placePiece(next, targetSquare, piece);
    });
    playMoveSound(false);
    return true;
  };

  const handleClearBoard = () => {
    setPosition({});
    playMoveSound(false);
  };

  const handleResetStarting = () => {
    setPosition(fenToPosition(STARTING_FEN));
    setTurn('w');
    setCastling(ALL_CASTLING);
    playMoveSound(false);
  };

  const handleCastlingToggle = (flag) => {
    setCastling((prev) => ({ ...prev, [flag]: !prev[flag] }));
  };

  const handleFenInput = (text) => {
    setFenDraft(text);
    try {
      const parsed = fenToPosition(text);
      const meta = parseFenMeta(text);
      setPosition(parsed);
      setTurn(meta.turn);
      setCastling(meta.castling);
    } catch {
      // Half-typed FEN: keep showing the draft and leave the board as it is.
    }
  };

  const handleCopyFen = async () => {
    try {
      await navigator.clipboard.writeText(fen);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.warn('Failed to copy FEN:', e);
    }
  };

  const handleFlipBoard = () => {
    setOrientation((prev) => (prev === 'white' ? 'black' : 'white'));
  };

  // A palette sits next to its own side of the board, so flipping the board
  // swaps the palettes too. Both palettes carry the eraser, so it is always
  // within reach; selecting it in one highlights it in both.
  const renderPalette = (color) => {
    const pieces = color === 'white' ? WHITE_PIECES : BLACK_PIECES;
    const colorName = color === 'white' ? 'White' : 'Black';
    return (
      <div className={`piece-palette ${color}-palette`}>
        <span className="palette-label">{colorName}</span>
        <div className="palette-items">
          {pieces.map((p) => {
            const isSelected = selectedTool === p.code;
            return (
              <button
                key={p.code}
                type="button"
                className={`palette-btn ${isSelected ? 'active' : ''}`}
                onClick={() => setSelectedTool(isSelected ? null : p.code)}
                title={`Select ${colorName} ${p.label}`}
              >
                <span className="piece-symbol">{p.symbol}</span>
              </button>
            );
          })}
          <button
            type="button"
            className={`palette-btn btn-trash ${selectedTool === 'trash' ? 'active' : ''}`}
            onClick={() => setSelectedTool(selectedTool === 'trash' ? null : 'trash')}
            title="Eraser: click squares to remove pieces"
          >
            🗑️
          </button>
        </div>
      </div>
    );
  };

  const bottomColor = orientation;
  const topColor = orientation === 'white' ? 'black' : 'white';

  const castlingOptions = [
    { flag: 'K', label: 'White O-O (Kingside)' },
    { flag: 'Q', label: 'White O-O-O (Queenside)' },
    { flag: 'k', label: 'Black O-O (Kingside)' },
    { flag: 'q', label: 'Black O-O-O (Queenside)' },
  ];

  return (
    <div className="card board-editor-card">
      <div className="editor-header">
        <div>
          <h3>🧩 Chess Board Editor</h3>
          <p className="editor-subtitle">
            Place pieces, set custom game setups, and export clean FEN for Stockfish analysis.
          </p>
        </div>
        <div className="editor-top-actions">
          <button type="button" className="preset-btn btn-danger-text" onClick={handleClearBoard}>
            🧹 Clear Board
          </button>
          <button
            type="button"
            className="preset-btn"
            onClick={handleFlipBoard}
            title="Flip the board and swap the piece palettes"
          >
            🔃 Flip Board
          </button>
          <button type="button" className="preset-btn" onClick={handleResetStarting}>
            🔄 Starting Position
          </button>
        </div>
      </div>

      <div className="editor-layout">
        {/* Board and Piece Palettes Column */}
        <div className="editor-board-col">
          {renderPalette(topColor)}

          {/* Interactive Chessboard */}
          <div className="editor-board-wrapper">
            <Chessboard
              position={position}
              boardOrientation={orientation}
              onSquareClick={handleSquareClick}
              onPieceDrop={handlePieceDrop}
              arePiecesDraggable={true}
              customBoardStyle={{
                borderRadius: '10px',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
              }}
              customDarkSquareStyle={{ backgroundColor: '#779952' }}
              customLightSquareStyle={{ backgroundColor: '#edeed1' }}
              animationDuration={150}
            />
          </div>

          {renderPalette(bottomColor)}
        </div>

        {/* Settings, FEN Output and Actions Column */}
        <div className="editor-controls-col">
          {/* Turn selector */}
          <div className="editor-card-section">
            <span className="section-heading">Turn to Move</span>
            <div className="turn-toggle-row">
              <button
                type="button"
                className={`turn-btn ${turn === 'w' ? 'active' : ''}`}
                onClick={() => setTurn('w')}
              >
                ⚪ White to Move
              </button>
              <button
                type="button"
                className={`turn-btn ${turn === 'b' ? 'active' : ''}`}
                onClick={() => setTurn('b')}
              >
                ⚫ Black to Move
              </button>
            </div>
          </div>

          {/* Castling Rights */}
          <div className="editor-card-section">
            <span className="section-heading">Castling Availability</span>
            <div className="castling-checkboxes">
              {castlingOptions.map(({ flag, label }) => {
                const possible = isCastlingPossible(position, flag);
                return (
                  <label
                    key={flag}
                    className="checkbox-label"
                    title={possible ? undefined : 'King and rook must be on their starting squares'}
                  >
                    <input
                      type="checkbox"
                      checked={possible && castling[flag]}
                      disabled={!possible}
                      onChange={() => handleCastlingToggle(flag)}
                    />
                    {label}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Resulting FEN Display */}
          <div className="editor-card-section">
            <span className="section-heading">Generated FEN</span>
            <div className="fen-result-box">
              <textarea
                className="fen-result-textarea"
                rows="3"
                value={fenDraft ?? fen}
                onChange={(e) => handleFenInput(e.target.value)}
                onBlur={() => setFenDraft(null)}
              />
              <div className="fen-result-actions">
                <button
                  type="button"
                  className="preset-btn"
                  onClick={handleCopyFen}
                  title="Copy generated FEN"
                >
                  {copied ? '✅ Copied!' : '📋 Copy FEN'}
                </button>
              </div>
            </div>

            {/* Validation warning */}
            {positionError && (
              <div className="editor-warn-box">
                ⚠️ To analyze this position, <strong>{positionError}</strong>.
              </div>
            )}
          </div>

          {/* Action button: Send to Stockfish */}
          <button
            type="button"
            className="btn btn-primary btn-analyze-editor"
            disabled={Boolean(positionError)}
            onClick={() => onApplyFen(fen)}
          >
            ⚡ Analyze this Setup with Stockfish
          </button>
        </div>
      </div>
    </div>
  );
}
