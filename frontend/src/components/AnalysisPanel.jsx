import React, { useState } from 'react';
import { formatCountdown } from '../hooks/useGeminiCooldown';
import { useT } from '../i18n';
import ModelPicker from './ModelPicker';

export default function AnalysisPanel({
  analysis,
  loading,
  onAskGrandmaster,
  aiCommentary,
  aiLoading,
  aiError,
  customApiKey,
  onSaveCustomApiKey,
  aiWaitSeconds = 0,
  modelPicker,
  onExplainEvaluation,
  evalExplanation = { status: 'idle' },
  variationPreview,
  onPreviewVariation,
}) {
  const t = useT();
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');

  if (loading) {
    return (
      <div className="card analysis-card placeholder-card">
        <div className="loading-state">
          <div className="pulsing-spinner"></div>
          <p>{t('analysis.loading')}</p>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="card analysis-card placeholder-card">
        <div className="empty-state">
          <span className="empty-icon">♟️</span>
          <h3>{t('analysis.empty.title')}</h3>
          <p>{t('analysis.empty.text')}</p>
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
          <h2>{t('analysis.title')}</h2>
          <p className="verbal-verdict">{verbal_verdict}</p>
        </div>
        <div className="header-badges">
          {is_checkmate && <span className="status-badge badge-mate">{t('analysis.badge.checkmate')}</span>}
          {is_stalemate && <span className="status-badge badge-draw">{t('analysis.badge.stalemate')}</span>}
          {is_check && !is_checkmate && <span className="status-badge badge-check">{t('analysis.badge.check')}</span>}
        </div>
      </div>

      {/* Primary Score & Best Move */}
      {bestLine && (
        <div className="eval-summary">
          <div className="eval-score-box">
            <span className="eval-label">{t('analysis.score')}</span>
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
            {onExplainEvaluation && (
              <button
                type="button"
                className="btn-explain-eval"
                onClick={onExplainEvaluation}
                disabled={evalExplanation.status === 'loading' || aiWaitSeconds > 0}
                title={
                  aiWaitSeconds > 0
                    ? t('analysis.why.waitHint')
                    : t('analysis.why.hint')
                }
              >
                {evalExplanation.status === 'loading'
                  ? t('analysis.why.thinking')
                  : aiWaitSeconds > 0
                  ? t('analysis.why.wait', { time: formatCountdown(aiWaitSeconds) })
                  : t('analysis.why.button')}
              </button>
            )}
          </div>

          <div className="best-move-box">
            <span className="best-move-label">{t('analysis.bestMove')}</span>
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

      {/* Why the position is rated so, from the Grandmaster */}
      {bestLine && evalExplanation.status !== 'idle' && (
        <div className="eval-explanation" aria-live="polite">
          <span className="eval-explanation-title">
            {t('analysis.why.title', { score: bestLine.score })}
          </span>
          {evalExplanation.status === 'loading' && (
            <p className="eval-explanation-text">
              <span className="spinner ai-spinner"></span> {t('analysis.why.loading')}
            </p>
          )}
          {evalExplanation.status === 'done' && (
            <p className="eval-explanation-text">{evalExplanation.text}</p>
          )}
          {evalExplanation.status === 'error' && (
            <p className="eval-explanation-error">⚠️ {evalExplanation.error}</p>
          )}
        </div>
      )}

      {/* Ask Grandmaster (Gemini AI) Section */}
      <div className="ai-grandmaster-section">
        <div className="ai-section-header">
          <span className="ai-section-title">{t('analysis.ai.title')}</span>
          <div className="ai-header-controls">
            <button
              type="button"
              className="btn-link-key"
              onClick={() => setShowKeyInput(!showKeyInput)}
              title={t('analysis.key.toggle')}
            >
              ⚙️ {customApiKey ? t('analysis.key.isSet') : t('analysis.key.notSet')}
            </button>
            <button
              type="button"
              className="btn btn-ai-ask"
              onClick={onAskGrandmaster}
              disabled={aiLoading || !bestLine || aiWaitSeconds > 0}
              title={
                aiWaitSeconds > 0
                  ? t('analysis.ask.waitHint')
                  : t('analysis.ask.hint')
              }
            >
              {aiLoading ? (
                <>
                  <span className="spinner ai-spinner"></span> {t('analysis.ask.thinking')}
                </>
              ) : aiWaitSeconds > 0 ? (
                t('analysis.ask.wait', { time: formatCountdown(aiWaitSeconds) })
              ) : (
                t('analysis.ask.button')
              )}
            </button>
          </div>
        </div>

        {/* The model is always offered here, so it neither appears nor vanishes
            as a pause starts and ends (a pause after a failed image read locks
            this button too). It comes first, so the countdown text after it
            can change without moving an open dropdown. */}
        {modelPicker && (
          <div className="gemini-wait ai-wait">
            <ModelPicker
              {...modelPicker}
              label={t('analysis.model.label')}
              ariaLabel={t('analysis.model.ariaLabel')}
              className="model-picker-inline"
            />
            {aiWaitSeconds > 0 && (
              <span>{t('analysis.wait', { time: formatCountdown(aiWaitSeconds) })}</span>
            )}
          </div>
        )}

        {/* Inline API Key settings toggle */}
        {showKeyInput && (
          <form onSubmit={handleSaveKey} className="key-input-form">
            <label htmlFor="gemini-key" className="key-input-label">
              {t('analysis.key.label')}
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
                {t('analysis.key.save')}
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
                  {t('analysis.key.clear')}
                </button>
              )}
            </div>
            <p className="key-help-text">
              {t('analysis.key.helpBefore')}{' '}
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="accent-link"
              >
                Google AI Studio ↗
              </a>{' '}
              {t('analysis.key.helpAfter')}
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
                {t('analysis.key.enter')}
              </button>
            )}
          </div>
        )}

        {/* AI Loading state placeholder */}
        {aiLoading && (
          <div className="ai-loading-card">
            <div className="pulsing-spinner ai-pulsing-spinner"></div>
            <div className="ai-loading-text">
              <strong>{t('analysis.ai.loadingTitle')}</strong>
              <span>{t('analysis.ai.loadingText')}</span>
            </div>
          </div>
        )}

        {/* AI Commentary result card */}
        {aiCommentary && !aiLoading && (
          <div className="ai-commentary-card">
            <div className="ai-commentary-header">
              <span className="ai-commentary-badge">{t('analysis.ai.badge')}</span>
              <button
                type="button"
                className="btn-refresh-ai"
                onClick={onAskGrandmaster}
                title={t('analysis.ai.refreshHint')}
              >
                {t('analysis.ai.refresh')}
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
            <span>{t('analysis.wdl.title')}</span>
            <span className="wdl-legend">
              <span className="wdl-leg-w">{t('analysis.wdl.win', { pct: wdl.win_pct })}</span> ·{' '}
              <span className="wdl-leg-d">{t('analysis.wdl.draw', { pct: wdl.draw_pct })}</span> ·{' '}
              <span className="wdl-leg-l">{t('analysis.wdl.loss', { pct: wdl.loss_pct })}</span>
            </span>
          </div>
          <div className="wdl-bar">
            <div
              className="wdl-segment wdl-win"
              style={{ width: `${wdl.win_pct}%` }}
              title={t('analysis.wdl.winHint', { pct: wdl.win_pct })}
            />
            <div
              className="wdl-segment wdl-draw"
              style={{ width: `${wdl.draw_pct}%` }}
              title={t('analysis.wdl.drawHint', { pct: wdl.draw_pct })}
            />
            <div
              className="wdl-segment wdl-loss"
              style={{ width: `${wdl.loss_pct}%` }}
              title={t('analysis.wdl.lossHint', { pct: wdl.loss_pct })}
            />
          </div>
        </div>
      )}

      {/* Material Balance */}
      {material && (
        <div className="material-bar">
          <span className="material-label">{t('analysis.material')}</span>
          <span>{t('analysis.material.white', { points: material.white })}</span>
          <span className="material-divider">{t('analysis.material.vs')}</span>
          <span>{t('analysis.material.black', { points: material.black })}</span>
          {material.diff !== 0 && (
            <span
              className={`material-diff-badge ${
                material.diff > 0 ? 'diff-pos' : 'diff-neg'
              }`}
            >
              {material.diff > 0
                ? t('analysis.material.whiteUp', { diff: material.diff })
                : t('analysis.material.blackUp', { diff: material.diff })}
            </span>
          )}
        </div>
      )}

      {/* Top Engine Lines */}
      <div className="lines-section">
        <h3>{t('analysis.lines.title')}</h3>
        {!lines || lines.length === 0 ? (
          <p className="no-lines">{t('analysis.lines.none')}</p>
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
                  <span className="variation-label">{t('analysis.lines.variation')}</span>{' '}
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
                            title={t('analysis.lines.preview', { n: mIdx + 1, move: m })}
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
          <span>{t('analysis.stats.depth', { depth: stats.depth })}</span>
          {stats.nodes && <span>{t('analysis.stats.nodes', { nodes: stats.nodes.toLocaleString() })}</span>}
          {stats.nps && <span>{t('analysis.stats.speed', { speed: Math.round(stats.nps / 1000) })}</span>}
          {stats.time_seconds && <span>{t('analysis.stats.time', { seconds: stats.time_seconds })}</span>}
        </div>
      )}
    </div>
  );
}
