import React, { useState } from 'react';

export default function AnalysisPanel({
  analysis,
  loading,
  onAskGrandmaster,
  aiCommentary,
  aiLoading,
  aiError,
  customApiKey,
  onSaveCustomApiKey,
  variationPreview,
  onPreviewVariation,
}) {
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');

  if (loading) {
    return (
      <div className="card analysis-card placeholder-card">
        <div className="loading-state">
          <div className="pulsing-spinner"></div>
          <p>Stockfish is computing variations and tactical evaluation...</p>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="card analysis-card placeholder-card">
        <div className="empty-state">
          <span className="empty-icon">♟️</span>
          <h3>Ready for Engine Evaluation</h3>
          <p>Make a move on the board or analyze a position to view Stockfish evaluation.</p>
        </div>
      </div>
    );
  }

  const {
    lines,
    is_check,
    is_checkmate,
    is_stalemate,
    verbal_verdict,
    material,
    wdl,
    stats,
  } = analysis;

  const bestLine = lines && lines.length > 0 ? lines[0] : null;

  const handleSaveKey = (e) => {
    e.preventDefault();
    if (onSaveCustomApiKey) {
      onSaveCustomApiKey(keyDraft.trim());
      setShowKeyInput(false);
    }
  };

  return (
    <div className="card analysis-card">
      <div className="analysis-header">
        <div>
          <h2>Evaluation & Tactics</h2>
          <p className="verbal-verdict">{verbal_verdict}</p>
        </div>
        <div className="header-badges">
          {is_checkmate && <span className="status-badge badge-mate">Checkmate</span>}
          {is_stalemate && <span className="status-badge badge-draw">Stalemate</span>}
          {is_check && !is_checkmate && <span className="status-badge badge-check">Check!</span>}
        </div>
      </div>

      {/* Primary Score & Best Move */}
      {bestLine && (
        <div className="eval-summary">
          <div className="eval-score-box">
            <span className="eval-label">Score (White's view)</span>
            <span
              className={`eval-score ${
                bestLine.score.startsWith('+')
                  ? 'positive'
                  : bestLine.score.startsWith('-')
                  ? 'negative'
                  : 'neutral'
              }`}
            >
              {bestLine.score}
            </span>
          </div>

          <div className="best-move-box">
            <span className="best-move-label">Best Move & Tactics</span>
            <div className="best-move-content">
              <span className="best-move-san">{bestLine.move_san}</span>
              <span className="best-move-uci">({bestLine.move_uci})</span>
            </div>
            {bestLine.explanation && (
              <span className="best-move-explanation">⚡ {bestLine.explanation}</span>
            )}
          </div>
        </div>
      )}

      {/* Ask Grandmaster (Gemini AI) Section */}
      <div className="ai-grandmaster-section">
        <div className="ai-section-header">
          <span className="ai-section-title">🎓 Grandmaster AI Commentary</span>
          <div className="ai-header-controls">
            <button
              type="button"
              className="btn-link-key"
              onClick={() => setShowKeyInput(!showKeyInput)}
              title="Configure Gemini API Key"
            >
              ⚙️ {customApiKey ? 'API Key Set' : 'Set API Key'}
            </button>
            <button
              type="button"
              className="btn btn-ai-ask"
              onClick={onAskGrandmaster}
              disabled={aiLoading || !bestLine}
              title="Generate natural language explanation from Google Gemini"
            >
              {aiLoading ? (
                <>
                  <span className="spinner ai-spinner"></span> Thinking...
                </>
              ) : (
                '🤖 Ask Grandmaster'
              )}
            </button>
          </div>
        </div>

        {/* Inline API Key settings toggle */}
        {showKeyInput && (
          <form onSubmit={handleSaveKey} className="key-input-form">
            <label htmlFor="gemini-key" className="key-input-label">
              Gemini API Key (saved in browser):
            </label>
            <div className="key-input-row">
              <input
                id="gemini-key"
                type="password"
                className="text-input text-input-sm"
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                placeholder={customApiKey ? '••••••••••••••••' : 'AIzaSy...'}
              />
              <button type="submit" className="btn btn-primary btn-sm">
                Save
              </button>
              {customApiKey && (
                <button
                  type="button"
                  className="preset-btn btn-danger-text"
                  onClick={() => {
                    onSaveCustomApiKey('');
                    setKeyDraft('');
                  }}
                >
                  Clear
                </button>
              )}
            </div>
            <p className="key-help-text">
              Free key available in 30 seconds at{' '}
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="accent-link"
              >
                Google AI Studio ↗
              </a>{' '}
              (or set `GEMINI_API_KEY` in `backend/.env`).
            </p>
          </form>
        )}

        {/* AI Error notice if key is missing or request failed */}
        {aiError && (
          <div className="ai-error-box">
            <span>⚠️ {aiError}</span>
            {!customApiKey && (
              <button
                type="button"
                className="btn-accent-sm mt-1"
                onClick={() => setShowKeyInput(true)}
              >
                Enter API Key
              </button>
            )}
          </div>
        )}

        {/* AI Loading state placeholder */}
        {aiLoading && (
          <div className="ai-loading-card">
            <div className="pulsing-spinner ai-pulsing-spinner"></div>
            <div className="ai-loading-text">
              <strong>Grandmaster is analyzing the board...</strong>
              <span>Formulating tactical breakdown and strategic plan with Gemini</span>
            </div>
          </div>
        )}

        {/* AI Commentary result card */}
        {aiCommentary && !aiLoading && (
          <div className="ai-commentary-card">
            <div className="ai-commentary-header">
              <span className="ai-commentary-badge">🎓 FIDE Grandmaster Coaching:</span>
              <button
                type="button"
                className="btn-refresh-ai"
                onClick={onAskGrandmaster}
                title="Regenerate Grandmaster commentary"
              >
                🔄 Refresh
              </button>
            </div>
            <p className="ai-commentary-text">"{aiCommentary}"</p>
          </div>
        )}
      </div>

      {/* Win / Draw / Loss Probability Bar */}
      {wdl && (
        <div className="wdl-container">
          <div className="wdl-header">
            <span>Stockfish WDL Model (White / Draw / Black)</span>
            <span className="wdl-legend">
              <span className="wdl-leg-w">{wdl.win_pct}% Win</span> ·{' '}
              <span className="wdl-leg-d">{wdl.draw_pct}% Draw</span> ·{' '}
              <span className="wdl-leg-l">{wdl.loss_pct}% Loss</span>
            </span>
          </div>
          <div className="wdl-bar">
            <div
              className="wdl-segment wdl-win"
              style={{ width: `${wdl.win_pct}%` }}
              title={`White win probability: ${wdl.win_pct}%`}
            />
            <div
              className="wdl-segment wdl-draw"
              style={{ width: `${wdl.draw_pct}%` }}
              title={`Draw probability: ${wdl.draw_pct}%`}
            />
            <div
              className="wdl-segment wdl-loss"
              style={{ width: `${wdl.loss_pct}%` }}
              title={`Black win probability: ${wdl.loss_pct}%`}
            />
          </div>
        </div>
      )}

      {/* Material Balance */}
      {material && (
        <div className="material-bar">
          <span className="material-label">Material:</span>
          <span>White {material.white} pts</span>
          <span className="material-divider">vs</span>
          <span>Black {material.black} pts</span>
          {material.diff !== 0 && (
            <span
              className={`material-diff-badge ${
                material.diff > 0 ? 'diff-pos' : 'diff-neg'
              }`}
            >
              {material.diff > 0 ? `+${material.diff} White` : `${material.diff} Black`}
            </span>
          )}
        </div>
      )}

      {/* Top Engine Lines */}
      <div className="lines-section">
        <h3>Top Engine Lines (MultiPV)</h3>
        {!lines || lines.length === 0 ? (
          <p className="no-lines">No legal moves available from this position.</p>
        ) : (
          <div className="lines-list">
            {lines.map((line) => (
              <div key={line.rank} className="line-item">
                <div className="line-top">
                  <span className="line-rank">#{line.rank}</span>
                  <span className="line-move">{line.move_san}</span>
                  <span className="line-expl">{line.explanation}</span>
                  <span className="line-score">{line.score}</span>
                </div>
                <div className="line-variation">
                  <span className="variation-label">Variation:</span>{' '}
                  <span className="variation-moves-list">
                    {(line.pv_san && line.pv_san.length > 0 ? line.pv_san : [line.move_san]).map(
                      (m, mIdx) => {
                        const isSelected =
                          variationPreview?.lineRank === line.rank &&
                          variationPreview?.stepIndex === mIdx;
                        return (
                          <button
                            key={mIdx}
                            type="button"
                            className={`btn-pv-move ${isSelected ? 'active' : ''}`}
                            onClick={() =>
                              onPreviewVariation &&
                              onPreviewVariation(
                                line.rank,
                                line.pv_san && line.pv_san.length > 0
                                  ? line.pv_san
                                  : [line.move_san],
                                mIdx
                              )
                            }
                            title={`Preview position after move ${mIdx + 1}: ${m}`}
                          >
                            {m}
                          </button>
                        );
                      }
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Engine Stats footer */}
      {stats && (
        <div className="engine-stats">
          <span>Depth: {stats.depth}</span>
          {stats.nodes && <span>Nodes: {stats.nodes.toLocaleString()}</span>}
          {stats.nps && <span>Speed: {Math.round(stats.nps / 1000)} kN/s</span>}
          {stats.time_seconds && <span>Time: {stats.time_seconds}s</span>}
        </div>
      )}
    </div>
  );
}
