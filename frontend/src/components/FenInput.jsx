import React from 'react';
import { useT } from '../i18n';

const PRESETS = [
  {
    nameKey: 'fen.preset.start',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  },
  {
    nameKey: 'fen.preset.kasparov',
    fen: 'b2r3r/k4p1p/p2q1np1/NppP4/3p1Q2/P4PPB/1PP4P/1K1RR3 w - - 0 1',
  },
  {
    nameKey: 'fen.preset.puzzle',
    fen: 'r1b2rk1/2p2ppp/p7/1p6/3P3q/1BP2QP1/PP3P1b/RNB1R2K b - - 0 1',
  },
  {
    nameKey: 'fen.preset.endgame',
    fen: '8/8/5k2/R7/4P3/8/5K2/8 w - - 0 1',
  },
];

// The depth and number of lines are set in AnalysisSettings, on every tab.
export default function FenInput({ fen, onFenChange, onAnalyze, loading }) {
  const t = useT();
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
            {t('fen.label')}
          </label>
          <div className="pgn-textarea-wrapper">
            <input
              id="fen-input"
              type="text"
              className="text-input"
              value={fen}
              onChange={(e) => onFenChange(e.target.value)}
              placeholder={t('fen.placeholder')}
              disabled={loading}
              required
            />
            {fen && (
              <button
                type="button"
                className="btn-clear-inside"
                onClick={() => onFenChange('')}
                title={t('fen.clearHint')}
                disabled={loading}
              >
                {t('fen.clearInside')}
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
              title={t('fen.pasteHint')}
              disabled={loading}
            >
              {t('fen.paste')}
            </button>
            {fen && (
              <button
                type="button"
                className="preset-btn btn-danger-text"
                onClick={() => onFenChange('')}
                disabled={loading}
              >
                {t('fen.clear')}
              </button>
            )}
            <span className="presets-label" style={{ marginLeft: '6px' }}>{t('fen.examples')}</span>
            {PRESETS.map((p, index) => (
              <button
                key={index}
                type="button"
                className="preset-btn"
                onClick={() => onFenChange(p.fen)}
                disabled={loading}
              >
                {t(p.nameKey)}
              </button>
            ))}
          </div>
        </div>

        <div className="controls-row">
          <button
            type="submit"
            className="btn btn-primary btn-analyze"
            disabled={loading || !fen.trim()}
          >
            {loading ? (
              <>
                <span className="spinner"></span>
                {t('fen.analyzing')}
              </>
            ) : (
              t('fen.analyze')
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
