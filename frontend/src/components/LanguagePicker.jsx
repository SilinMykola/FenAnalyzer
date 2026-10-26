import React from 'react';
import { LANGUAGES, useI18n } from '../i18n';

/** The interface language, in the header; Gemini answers in it too. */
function LanguagePicker() {
  const { language, setLanguage, t } = useI18n();

  return (
    <label className="model-picker language-picker" title={t('app.language')}>
      <span className="model-picker-label">🌐</span>
      <select aria-label={t('app.language')} value={language} onChange={(e) => setLanguage(e.target.value)}>
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// Re-rendered only when the language changes, not on every countdown tick,
// which would close an open dropdown in some browsers.
export default React.memo(LanguagePicker);
