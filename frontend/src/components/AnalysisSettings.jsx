import React, { useEffect, useState } from 'react';

/**
 * Stockfish's depth and number of lines, shown on every tab.
 *
 * depth and multipv are the applied values. The sliders change only their own
 * copy, so moving them sends nothing to Stockfish; Apply, shown once a value
 * differs, calls onApply(depth, multipv) with what they show.
 * applyHint is Apply's tooltip, as Apply does different things per tab.
 */
export default function AnalysisSettings({ depth, multipv, onApply, loading, applyHint }) {
  const [draftDepth, setDraftDepth] = useState(depth);
  const [draftMultipv, setDraftMultipv] = useState(multipv);
  useEffect(() => setDraftDepth(depth), [depth]);
  useEffect(() => setDraftMultipv(multipv), [multipv]);
  const changed = draftDepth !== depth || draftMultipv !== multipv;

  return (
    <div className="card analysis-settings">
      <span className="form-label analysis-settings-title">Stockfish</span>

      <div className="control-item">
        <label htmlFor="depth-select" className="control-label">
          Depth: <strong>{draftDepth}</strong>
        </label>
        <input
          id="depth-select"
          type="range"
          min="10"
          max="30"
          step="1"
          value={draftDepth}
          onChange={(e) => setDraftDepth(Number(e.target.value))}
          disabled={loading}
        />
      </div>

      <div className="control-item">
        <label htmlFor="multipv-select" className="control-label">
          Lines: <strong>{draftMultipv}</strong>
        </label>
        <input
          id="multipv-select"
          type="range"
          min="1"
          max="5"
          step="1"
          value={draftMultipv}
          onChange={(e) => setDraftMultipv(Number(e.target.value))}
          disabled={loading}
        />
      </div>

      {changed && (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => onApply(draftDepth, draftMultipv)}
          disabled={loading}
          title={applyHint}
        >
          ✓ Apply
        </button>
      )}
    </div>
  );
}
