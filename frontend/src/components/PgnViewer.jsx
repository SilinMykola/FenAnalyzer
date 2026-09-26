import React, { useState } from 'react';

const SAMPLE_PGN = `[Event "World Championship Match 1972"]
[Site "Reykjavik ISL"]
[Date "1972.07.23"]
[Round "6"]
[White "Robert James Fischer"]
[Black "Boris Spassky"]
[Result "1-0"]

1. c4 e6 2. Nf3 d5 3. d4 Nf6 4. Nc3 Be7 5. Bg5 O-O 6. e3 h6 7. Bh4 b6 8. cxd5 Nxd5 9. Bxe7 Qxe7 10. Nxd5 exd5 11. Rc1 Be6 12. Qa4 c5 13. Qa3 Rc8 14. Bb5 a6 15. dxc5 bxc5 16. O-O Ra7 17. Be2 Nd7 18. Nd4 Qf8 19. Nxe6 fxe6 20. e4 d4 21. f4 Qe7 22. e5 Rb8 23. Bc4 Kh8 24. Qh3 Nf8 25. b3 a5 26. f5 exf5 27. Rxf5 Nh7 28. Rcf1 Qd8 29. Qg3 Re7 30. h4 Rbb7 31. e6 Rbc7 32. Qe5 Qe8 33. a4 Qd8 34. R1f2 Qe8 35. R2f3 Qd8 36. Bd3 Qe8 37. Qe4 Nf6 38. Rxf6 gxf6 39. Rxf6 Kg8 40. Bc4 Kh8 41. Qf4 1-0`;

export default function PgnViewer({
  pgnText,
  onPgnTextChange,
  onLoadPgn,
  onResetGame,
  moves,
  currentMoveIndex,
  onSelectMove,
  onPrevMove,
  onNextMove,
  onFirstMove,
  onLastMove,
  headers,
}) {
  const [showInput, setShowInput] = useState(false);

  // Group moves into pairs (white, black) respecting custom start move numbers
  const movePairs = [];
  let currentRow = null;

  moves.forEach((m, idx) => {
    const fullMoveNumber = parseInt(m.before?.split(' ')[5], 10) || Math.floor(idx / 2) + 1;
    if (m.color === 'w' || !currentRow || currentRow.number !== fullMoveNumber) {
      if (currentRow) movePairs.push(currentRow);
      currentRow = {
        number: fullMoveNumber,
        white: null,
        whiteIndex: null,
        black: null,
        blackIndex: null,
      };
    }

    if (m.color === 'w') {
      currentRow.white = m;
      currentRow.whiteIndex = idx;
    } else {
      currentRow.black = m;
      currentRow.blackIndex = idx;
    }
  });

  if (currentRow) {
    movePairs.push(currentRow);
  }

  const handleImport = (e) => {
    e.preventDefault();
    if (!pgnText.trim()) return;
    onLoadPgn(pgnText);
    setShowInput(false);
  };

  const handlePasteClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          onPgnTextChange(text);
        }
      }
    } catch (err) {
      // Browser permissions denied
    }
  };

  return (
    <div className="card pgn-card">
      <div className="pgn-header">
        <div className="pgn-title">
          <h3>PGN Game Review</h3>
          {headers?.White && headers?.Black && (
            <span className="players-badge">
              {headers.White} vs {headers.Black} ({headers.Result || '*'})
            </span>
          )}
        </div>
        <div className="pgn-header-actions">
          {moves.length > 0 && onResetGame && (
            <button
              type="button"
              className="btn-reset-game"
              onClick={() => {
                onPgnTextChange('');
                onResetGame();
              }}
              title="Clear loaded game and reset board to starting position"
            >
              🗑️ Clear Game
            </button>
          )}
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => setShowInput(!showInput)}
          >
            {showInput ? 'Hide PGN Input' : '📥 Import / Paste PGN'}
          </button>
        </div>
      </div>

      {showInput && (
        <form onSubmit={handleImport} className="pgn-input-form">
          <div className="pgn-textarea-wrapper">
            <textarea
              className="pgn-textarea"
              rows="6"
              value={pgnText}
              onChange={(e) => onPgnTextChange(e.target.value)}
              placeholder="Paste your PGN game notation here (e.g. from Chess.com or Lichess)..."
              autoFocus
            />
            {pgnText && (
              <button
                type="button"
                className="btn-clear-inside"
                onClick={() => onPgnTextChange('')}
                title="Clear text"
              >
                ✕ Clear
              </button>
            )}
          </div>

          <div className="pgn-form-actions">
            <div className="pgn-left-actions">
              <button
                type="button"
                className="preset-btn"
                onClick={handlePasteClipboard}
                title="Paste text from clipboard"
              >
                📋 Paste from Clipboard
              </button>
              <button
                type="button"
                className="preset-btn"
                onClick={() => onPgnTextChange(SAMPLE_PGN)}
              >
                Load Fischer vs Spassky
              </button>
              {pgnText && (
                <button
                  type="button"
                  className="preset-btn btn-danger-text"
                  onClick={() => onPgnTextChange('')}
                >
                  Clear Text
                </button>
              )}
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={!pgnText.trim()}
            >
              Parse & Load Game
            </button>
          </div>
        </form>
      )}

      {/* Navigation Controller */}
      <div className="pgn-controls">
        <button
          type="button"
          className="pgn-nav-btn"
          onClick={onFirstMove}
          disabled={currentMoveIndex < 0}
          title="Start of game (Home)"
        >
          ⏮ First
        </button>
        <button
          type="button"
          className="pgn-nav-btn"
          onClick={onPrevMove}
          disabled={currentMoveIndex < 0}
          title="Previous move (← Arrow)"
        >
          ◀ Prev
        </button>
        <span className="pgn-counter">
          Move {currentMoveIndex + 1} of {moves.length}
        </span>
        <button
          type="button"
          className="pgn-nav-btn"
          onClick={onNextMove}
          disabled={currentMoveIndex >= moves.length - 1}
          title="Next move (→ Arrow)"
        >
          Next ▶
        </button>
        <button
          type="button"
          className="pgn-nav-btn"
          onClick={onLastMove}
          disabled={currentMoveIndex >= moves.length - 1}
          title="End of game (End)"
        >
          Last ⏭
        </button>
      </div>

      {/* Moves Scoresheet List */}
      <div className="moves-sheet">
        {movePairs.length === 0 ? (
          <div className="no-moves-msg">
            <p>No PGN game loaded yet.</p>
            <button
              type="button"
              className="preset-btn mt-2"
              onClick={() => {
                onPgnTextChange(SAMPLE_PGN);
                onLoadPgn(SAMPLE_PGN);
              }}
            >
              Load Sample World Championship Game
            </button>
          </div>
        ) : (
          <div className="moves-grid">
            {movePairs.map((pair) => (
              <div key={pair.number} className="move-pair-row">
                <span className="move-number">{pair.number}.</span>
                {pair.white ? (
                  <button
                    type="button"
                    className={`move-btn ${currentMoveIndex === pair.whiteIndex ? 'active' : ''}`}
                    onClick={() => onSelectMove(pair.whiteIndex)}
                  >
                    {pair.white.san}
                  </button>
                ) : (
                  <span className="move-placeholder">...</span>
                )}
                {pair.black && (
                  <button
                    type="button"
                    className={`move-btn ${currentMoveIndex === pair.blackIndex ? 'active' : ''}`}
                    onClick={() => onSelectMove(pair.blackIndex)}
                  >
                    {pair.black.san}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
