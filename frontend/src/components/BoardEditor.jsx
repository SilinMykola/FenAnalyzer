import React, { useState } from 'react';
import { Chessboard } from 'react-chessboard';
import { useT } from '../i18n';
import { playMoveSound } from '../utils/sound';
import {
  CASTLING_FLAGS,
  buildFen,
  fenToPosition,
  getPositionError,
  isCastlingPossible,
  parseFenMeta,
} from '../utils/editorFen';

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const ALL_CASTLING = { K: true, Q: true, k: true, q: true };

const WHITE_PIECES = [
  { code: 'wK', symbol: '♔' },
  { code: 'wQ', symbol: '♕' },
  { code: 'wR', symbol: '♖' },
  { code: 'wB', symbol: '♗' },
  { code: 'wN', symbol: '♘' },
  { code: 'wP', symbol: '♙' },
];

const BLACK_PIECES = [
  { code: 'bK', symbol: '♚' },
  { code: 'bQ', symbol: '♛' },
  { code: 'bR', symbol: '♜' },
  { code: 'bB', symbol: '♝' },
  { code: 'bN', symbol: '♞' },
  { code: 'bP', symbol: '♟' },
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
  const t = useT();
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
  const positionError = getPositionError(fen, t);

  const handleSquareClick = (square) => {
    const placing = selectedTool && selectedTool !== 'trash';
    if (placing && position[square] !== selectedTool) {
      setPosition((prev) => placePiece(prev, square, selectedTool));
    } else if (position[square]) {
      // The eraser, or a click with no tool selected, removes the piece. So
      // does a click with the very piece that stands there: the first click
      // puts a piece down, a second one on the same square takes it away.
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
    return (
      <div className={`piece-palette ${color}-palette`}>
        <span className="palette-label">{t(`editor.palette.${color}`)}</span>
        <div className="palette-items">
          {pieces.map((p) => {
            const isSelected = selectedTool === p.code;
            return (
              <button
                key={p.code}
                type="button"
                className={`palette-btn ${isSelected ? 'active' : ''}`}
                onClick={() => setSelectedTool(isSelected ? null : p.code)}
                title={t(`editor.select.${p.code}`)}
              >
                <span className="piece-symbol">{p.symbol}</span>
              </button>
            );
          })}
          <button
            type="button"
            className={`palette-btn btn-trash ${selectedTool === 'trash' ? 'active' : ''}`}
            onClick={() => setSelectedTool(selectedTool === 'trash' ? null : 'trash')}
            title={t('editor.eraser')}
          >
            🗑️
          </button>
        </div>
      </div>
    );
  };

  const bottomColor = orientation;
  const topColor = orientation === 'white' ? 'black' : 'white';

  // The validation sentence holds the instruction in bold, wherever the
  // language puts it: split the sentence around its {error} placeholder.
  const [warnBefore, warnAfter] = t('editor.warn').split('{error}');

  return (
    <div className="card board-editor-card">
      <div className="editor-header">
        <div>
          <h3>{t('editor.title')}</h3>
          <p className="editor-subtitle">{t('editor.subtitle')}</p>
        </div>
        <div className="editor-top-actions">
          <button type="button" className="preset-btn btn-danger-text" onClick={handleClearBoard}>
            {t('editor.clear')}
          </button>
          <button
            type="button"
            className="preset-btn"
            onClick={handleFlipBoard}
            title={t('editor.flipHint')}
          >
            {t('editor.flip')}
          </button>
          <button type="button" className="preset-btn" onClick={handleResetStarting}>
            {t('editor.start')}
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
            <span className="section-heading">{t('editor.turn.heading')}</span>
            <div className="turn-toggle-row">
              <button
                type="button"
                className={`turn-btn ${turn === 'w' ? 'active' : ''}`}
                onClick={() => setTurn('w')}
              >
                {t('editor.turn.white')}
              </button>
              <button
                type="button"
                className={`turn-btn ${turn === 'b' ? 'active' : ''}`}
                onClick={() => setTurn('b')}
              >
                {t('editor.turn.black')}
              </button>
            </div>
          </div>

          {/* Castling Rights */}
          <div className="editor-card-section">
            <span className="section-heading">{t('editor.castling.heading')}</span>
            <div className="castling-checkboxes">
              {CASTLING_FLAGS.map((flag) => {
                const possible = isCastlingPossible(position, flag);
                return (
                  <label
                    key={flag}
                    className="checkbox-label"
                    title={possible ? undefined : t('editor.castling.impossible')}
                  >
                    <input
                      type="checkbox"
                      checked={possible && castling[flag]}
                      disabled={!possible}
                      onChange={() => handleCastlingToggle(flag)}
                    />
                    {t(`editor.castling.${flag}`)}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Resulting FEN Display */}
          <div className="editor-card-section">
            <span className="section-heading">{t('editor.fen.heading')}</span>
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
                  title={t('editor.copyHint')}
                >
                  {copied ? t('editor.copied') : t('editor.copy')}
                </button>
              </div>
            </div>

            {/* Validation warning */}
            {positionError && (
              <div className="editor-warn-box">
                {warnBefore}
                <strong>{positionError}</strong>
                {warnAfter}
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
            {t('editor.analyze')}
          </button>
        </div>
      </div>
    </div>
  );
}
