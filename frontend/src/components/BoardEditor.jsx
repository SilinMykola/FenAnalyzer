import React, { useState, useEffect } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { playMoveSound } from '../utils/sound';

const EMPTY_BOARD_FEN = '8/8/8/8/8/8/8/8 w - - 0 1';
const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const WHITE_PIECES = [
  { code: 'K', type: 'k', color: 'w', symbol: '♔', label: 'King' },
  { code: 'Q', type: 'q', color: 'w', symbol: '♕', label: 'Queen' },
  { code: 'R', type: 'r', color: 'w', symbol: '♖', label: 'Rook' },
  { code: 'B', type: 'b', color: 'w', symbol: '♗', label: 'Bishop' },
  { code: 'N', type: 'n', color: 'w', symbol: '♘', label: 'Knight' },
  { code: 'P', type: 'p', color: 'w', symbol: '♙', label: 'Pawn' },
];

const BLACK_PIECES = [
  { code: 'k', type: 'k', color: 'b', symbol: '♚', label: 'King' },
  { code: 'q', type: 'q', color: 'b', symbol: '♛', label: 'Queen' },
  { code: 'r', type: 'r', color: 'b', symbol: '♜', label: 'Rook' },
  { code: 'b', type: 'b', color: 'b', symbol: '♝', label: 'Bishop' },
  { code: 'n', type: 'n', color: 'b', symbol: '♞', label: 'Knight' },
  { code: 'p', type: 'p', color: 'b', symbol: '♟', label: 'Pawn' },
];

export default function BoardEditor({ onApplyFen, initialFen }) {
  const [editorFen, setEditorFen] = useState(initialFen || STARTING_FEN);
  const [selectedTool, setSelectedTool] = useState(null); // piece object or 'trash' or null
  const [turn, setTurn] = useState('w');
  const [castling, setCastling] = useState({ K: true, Q: true, k: true, q: true });
  const [copied, setCopied] = useState(false);

  // Sync turn and castling rights from editorFen
  useEffect(() => {
    try {
      const parts = editorFen.split(' ');
      if (parts[1]) setTurn(parts[1]);
      if (parts[2]) {
        const c = parts[2];
        setCastling({
          K: c.includes('K'),
          Q: c.includes('Q'),
          k: c.includes('k'),
          q: c.includes('q'),
        });
      }
    } catch (e) {
      // Ignore parse errors on partial FEN
    }
  }, []);

  const updateFenWithMeta = (boardPart, newTurn = turn, newCastling = castling) => {
    let castlingStr = '';
    if (newCastling.K) castlingStr += 'K';
    if (newCastling.Q) castlingStr += 'Q';
    if (newCastling.k) castlingStr += 'k';
    if (newCastling.q) castlingStr += 'q';
    if (!castlingStr) castlingStr = '-';

    const fullFen = `${boardPart} ${newTurn} ${castlingStr} - 0 1`;
    setEditorFen(fullFen);
  };

  const handleSquareClick = (square) => {
    try {
      const game = new Chess(editorFen);
      if (selectedTool === 'trash') {
        game.remove(square);
      } else if (selectedTool) {
        game.put({ type: selectedTool.type, color: selectedTool.color }, square);
      } else {
        // Toggle remove if clicked without a tool
        const existing = game.get(square);
        if (existing) {
          game.remove(square);
        }
      }
      playMoveSound(false);
      const boardPart = game.fen().split(' ')[0];
      updateFenWithMeta(boardPart);
    } catch (err) {
      console.warn('Square click edit failed:', err);
    }
  };

  const handlePieceDrop = (sourceSquare, targetSquare) => {
    try {
      const game = new Chess(editorFen);
      const piece = game.get(sourceSquare);
      if (!piece) return false;
      game.remove(sourceSquare);
      game.put(piece, targetSquare);
      playMoveSound(false);
      const boardPart = game.fen().split(' ')[0];
      updateFenWithMeta(boardPart);
      return true;
    } catch (err) {
      return false;
    }
  };

  const handleClearBoard = () => {
    setEditorFen(EMPTY_BOARD_FEN);
    playMoveSound(false);
  };

  const handleResetStarting = () => {
    setEditorFen(STARTING_FEN);
    setTurn('w');
    setCastling({ K: true, Q: true, k: true, q: true });
    playMoveSound(false);
  };

  const handleTurnChange = (newTurn) => {
    setTurn(newTurn);
    const boardPart = editorFen.split(' ')[0];
    updateFenWithMeta(boardPart, newTurn, castling);
  };

  const handleCastlingToggle = (flag) => {
    const updated = { ...castling, [flag]: !castling[flag] };
    setCastling(updated);
    const boardPart = editorFen.split(' ')[0];
    updateFenWithMeta(boardPart, turn, updated);
  };

  const handleCopyFen = async () => {
    try {
      await navigator.clipboard.writeText(editorFen);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.warn('Failed to copy FEN:', e);
    }
  };

  // Validation
  const hasWhiteKing = editorFen.split(' ')[0].includes('K');
  const hasBlackKing = editorFen.split(' ')[0].includes('k');
  const isValid = hasWhiteKing && hasBlackKing;

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
          <button type="button" className="preset-btn" onClick={handleResetStarting}>
            🔄 Starting Position
          </button>
        </div>
      </div>

      <div className="editor-layout">
        {/* Board and Piece Palettes Column */}
        <div className="editor-board-col">
          {/* Black Piece Palette (Top) */}
          <div className="piece-palette black-palette">
            <span className="palette-label">Black Pieces:</span>
            <div className="palette-items">
              {BLACK_PIECES.map((p) => {
                const isSelected = selectedTool?.code === p.code;
                return (
                  <button
                    key={p.code}
                    type="button"
                    className={`palette-btn ${isSelected ? 'active' : ''}`}
                    onClick={() => setSelectedTool(isSelected ? null : p)}
                    title={`Select Black ${p.label}`}
                  >
                    <span className="piece-symbol">{p.symbol}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Interactive Chessboard */}
          <div className="editor-board-wrapper">
            <Chessboard
              position={editorFen}
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

          {/* White Piece Palette & Eraser (Bottom) */}
          <div className="piece-palette white-palette">
            <span className="palette-label">White Pieces:</span>
            <div className="palette-items">
              {WHITE_PIECES.map((p) => {
                const isSelected = selectedTool?.code === p.code;
                return (
                  <button
                    key={p.code}
                    type="button"
                    className={`palette-btn ${isSelected ? 'active' : ''}`}
                    onClick={() => setSelectedTool(isSelected ? null : p)}
                    title={`Select White ${p.label}`}
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
                onClick={() => handleTurnChange('w')}
              >
                ⚪ White to Move
              </button>
              <button
                type="button"
                className={`turn-btn ${turn === 'b' ? 'active' : ''}`}
                onClick={() => handleTurnChange('b')}
              >
                ⚫ Black to Move
              </button>
            </div>
          </div>

          {/* Castling Rights */}
          <div className="editor-card-section">
            <span className="section-heading">Castling Availability</span>
            <div className="castling-checkboxes">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={castling.K}
                  onChange={() => handleCastlingToggle('K')}
                />
                White O-O (Kingside)
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={castling.Q}
                  onChange={() => handleCastlingToggle('Q')}
                />
                White O-O-O (Queenside)
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={castling.k}
                  onChange={() => handleCastlingToggle('k')}
                />
                Black O-O (Kingside)
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={castling.q}
                  onChange={() => handleCastlingToggle('q')}
                />
                Black O-O-O (Queenside)
              </label>
            </div>
          </div>

          {/* Resulting FEN Display */}
          <div className="editor-card-section">
            <span className="section-heading">Generated FEN</span>
            <div className="fen-result-box">
              <textarea
                className="fen-result-textarea"
                rows="3"
                value={editorFen}
                onChange={(e) => setEditorFen(e.target.value)}
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
            {!isValid && (
              <div className="editor-warn-box">
                ⚠️ Position must include both a <strong>White King (♔)</strong> and a{' '}
                <strong>Black King (♚)</strong> to be analyzed by the engine.
              </div>
            )}
          </div>

          {/* Action button: Send to Stockfish */}
          <button
            type="button"
            className="btn btn-primary btn-analyze-editor"
            disabled={!isValid}
            onClick={() => onApplyFen(editorFen)}
          >
            ⚡ Analyze this Setup with Stockfish
          </button>
        </div>
      </div>
    </div>
  );
}
