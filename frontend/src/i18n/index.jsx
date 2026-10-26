import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import messages from './messages';

/**
 * The interface in English, German, Russian and Ukrainian.
 *
 * Texts are looked up by key: t('board.flip'). A text may hold {name}
 * placeholders, filled from the second argument: t('pgn.move', { n: 3 }).
 * A key missing in a language falls back to English, and a key missing
 * everywhere shows as itself, so a gap is visible but nothing breaks.
 *
 * Texts that come from the backend (the engine's verdicts and move
 * explanations, error messages) stay in English; Gemini answers in the
 * chosen language.
 */

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
  { code: 'ru', label: 'Русский' },
  { code: 'uk', label: 'Українська' },
];

const CODES = LANGUAGES.map((l) => l.code);
const STORAGE_KEY = 'language';

/** The saved choice, else the browser's language when offered, else English. */
export function detectLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (CODES.includes(saved)) return saved;
  } catch {
    // Storage blocked: go by the browser.
  }
  const browser = typeof navigator !== 'undefined' ? navigator.languages || [navigator.language] : [];
  for (const tag of browser) {
    const code = String(tag || '').toLowerCase().split('-')[0];
    if (CODES.includes(code)) return code;
  }
  return 'en';
}

export function translate(language, key, params) {
  const text = messages[language]?.[key] ?? messages.en[key] ?? key;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

const I18nContext = createContext({
  language: 'en',
  setLanguage: () => {},
  t: (key, params) => translate('en', key, params),
});

export function I18nProvider({ children, initialLanguage }) {
  const [language, setLanguageState] = useState(() => initialLanguage || detectLanguage());

  const setLanguage = useCallback((code) => {
    if (!CODES.includes(code)) return;
    setLanguageState(code);
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch {
      // The choice then lasts until the page is reloaded.
    }
  }, []);

  // Screen readers and the browser's spell checking follow the page language.
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo(
    () => ({ language, setLanguage, t: (key, params) => translate(language, key, params) }),
    [language, setLanguage]
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** { language, setLanguage, t } */
export const useI18n = () => useContext(I18nContext);

/** The translate function for the current language. */
export const useT = () => useContext(I18nContext).t;
