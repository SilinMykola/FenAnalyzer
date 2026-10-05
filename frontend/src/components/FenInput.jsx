import React from 'react';

const PRESETS = [
  {
    name: 'Starting Position',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  },
  {
    name: 'Kasparov Immortal (1999)',
    fen: 'b2r3r/k4p1p/p2q1np1/NppP4/3p1Q2/P4PPB/1PP4P/1K1RR3 w - - 0 1',
  },
  {
    name: 'Tactical Puzzle (Mate in 2)',
    fen: 'r1b2rk1/2p2ppp/p7/1p6/3P3q/1BP2QP1/PP3P1b/RNB1R2K b - - 0 1',
  },
  {
    name: 'Endgame (Rook + Pawn)',
    fen: '8/8/5k2/R7/4P3/8/5K2/8 w - - 0 1',
  },
];

export default function FenInput({
  fen,
  onFenChange,
  depth,
  onDepthChange,
  multipv,
  onMultipvChange,
  onAnalyze,
  loading,
}) {
  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        onFenChange(text.trim());
      }
    } catch (err) {
      console.warn('Clipboard read permission denied:', err);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!fen.trim() || loading) return;
    onAnalyze();
  };

  return (
    <div className="card fen-input-card">
      <form onSubmit={handleSubmit} className="fen-form">
        <div className="form-group">
          <label htmlFor="fen-input" className="form-label">
            FEN Position
          </label>
          <div className="pgn-textarea-wrapper">
            <input
              id="fen-input"
              type="text"
              className="text-input"
              value={fen}
              onChange={(e) => onFenChange(e.target.value)}
              placeholder="Paste FEN here (e.g. rnbqkbnr/pppppppp/...)"
              disabled={loading}
              required
            />
            {fen && (
              <button
                type="button"
                className="btn-clear-inside"
                onClick={() => onFenChange('')}
                title="Clear FEN"
                disabled={loading}
              >
                ✕ Clear
              </button>
            )}
          </div>
        </div>

        {/* Action buttons & presets in unified PGN style */}
        <div className="presets-container">
          <div className="presets-buttons">
            <button
              type="button"
              className="preset-btn"
              onClick={handlePasteClipboard}
              title="Paste FEN from clipboard"
              disabled={loading}
            >
              📋 Paste from Clipboard
            </button>
            {fen && (
              <button
                type="button"
                className="preset-btn btn-danger-text"
                onClick={() => onFenChange('')}
                disabled={loading}
              >
                Clear FEN
              </button>
            )}
            <span className="presets-label" style={{ marginLeft: '6px' }}>Examples:</span>
            {PRESETS.map((p, index) => (
              <button
                key={index}
                type="button"
                className="preset-btn"
                onClick={() => onFenChange(p.fen)}
                disabled={loading}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* Configuration: Depth & Lines */}
        <div className="controls-row">
          <div className="control-item">
            <label htmlFor="depth-select" className="control-label">
              Depth: <strong>{depth}</strong>
            </label>
            <input
              id="depth-select"
              type="range"
              min="8"
              max="24"
              step="1"
              value={depth}
              onChange={(e) => onDepthChange(Number(e.target.value))}
              disabled={loading}
            />
          </div>

          <div className="control-item">
            <label htmlFor="multipv-select" className="control-label">
              Lines: <strong>{multipv}</strong>
            </label>
            <input
              id="multipv-select"
              type="range"
              min="1"
              max="5"
              step="1"
              value={multipv}
              onChange={(e) => onMultipvChange(Number(e.target.value))}
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-analyze"
            disabled={loading || !fen.trim()}
          >
            {loading ? (
              <>
                <span className="spinner"></span>
                Analyzing...
              </>
            ) : (
              '⚡ Analyze with Stockfish'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
