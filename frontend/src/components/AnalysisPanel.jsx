import React from 'react';

export default function AnalysisPanel({ analysis, loading }) {
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
                  <span className="variation-moves">
                    {line.pv_san && line.pv_san.length > 0
                      ? line.pv_san.join(' ')
                      : line.move_san}
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
