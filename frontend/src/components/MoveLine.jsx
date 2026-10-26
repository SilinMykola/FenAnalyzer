import React from 'react';
import { useT } from '../i18n';
import { moveLabels } from '../utils/moveLine';

/**
 * The moves played on the board since a position was loaded, shown above the
 * board. Each move can be clicked to show its position; "Start" and ⏮ return
 * to the loaded position, whose FEN is shown below the moves.
 *
 * line: { startFen, moves: [{ san, fen }], index } (see utils/moveLine)
 */
export default function MoveLine({ line, onGoTo }) {
  const t = useT();
  if (line.moves.length === 0) return null;

  const labels = moveLabels(line);
  const atStart = line.index < 0;
  const atEnd = line.index >= line.moves.length - 1;

  return (
    <div className="move-line" aria-label={t('moveLine.title')}>
      <div className="move-line-header">
        <span className="move-line-title">{t('moveLine.title')}</span>
        <div className="move-line-nav">
          <button
            type="button"
            className="btn-vpb"
            onClick={() => onGoTo(-1)}
            disabled={atStart}
            title={t('moveLine.first')}
          >
            ⏮
          </button>
          <button
            type="button"
            className="btn-vpb"
            onClick={() => onGoTo(line.index - 1)}
            disabled={atStart}
            title={t('moveLine.prev')}
          >
            ◀
          </button>
          <button
            type="button"
            className="btn-vpb"
            onClick={() => onGoTo(line.index + 1)}
            disabled={atEnd}
            title={t('moveLine.next')}
          >
            ▶
          </button>
          <button
            type="button"
            className="btn-vpb"
            onClick={() => onGoTo(line.moves.length - 1)}
            disabled={atEnd}
            title={t('moveLine.last')}
          >
            ⏭
          </button>
        </div>
      </div>

      <div className="move-line-moves">
        <button
          type="button"
          className={`move-chip ${atStart ? 'active' : ''}`}
          aria-current={atStart ? 'step' : undefined}
          onClick={() => onGoTo(-1)}
        >
          {t('moveLine.start')}
        </button>
        {labels.map((label, i) => (
          <button
            key={i}
            type="button"
            className={`move-chip ${i === line.index ? 'active' : ''}`}
            aria-current={i === line.index ? 'step' : undefined}
            onClick={() => onGoTo(i)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="move-line-start">
        {t('moveLine.startFen')} <code>{line.startFen}</code>
      </div>
    </div>
  );
}
