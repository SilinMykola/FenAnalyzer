import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, LANGUAGES, detectLanguage, translate, useI18n } from '.';
import { parts } from './messages';

function browserLanguages(list) {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(list);
}

afterEach(() => vi.restoreAllMocks());

describe('detectLanguage', () => {
  it('takes the saved choice first', () => {
    browserLanguages(['de-DE']);
    localStorage.setItem('language', 'uk');

    expect(detectLanguage()).toBe('uk');
  });

  it("goes by the browser's languages, in their order", () => {
    browserLanguages(['fr-FR', 'ru-RU', 'de']);

    expect(detectLanguage()).toBe('ru');
  });

  it('falls back to English for a browser in another language', () => {
    browserLanguages(['fr-FR', 'es']);

    expect(detectLanguage()).toBe('en');
  });

  it('ignores a saved value it does not offer', () => {
    browserLanguages(['de-AT']);
    localStorage.setItem('language', 'fr');

    expect(detectLanguage()).toBe('de');
  });
});

describe('translate', () => {
  it('fills in placeholders', () => {
    expect(translate('en', 'app.preview.line', { rank: 2 })).toBe('Line #2');
    expect(translate('ru', 'app.preview.line', { rank: 2 })).toBe('Линия #2');
  });

  it('shows an unknown key as itself, so a gap is visible', () => {
    expect(translate('de', 'nowhere.key')).toBe('nowhere.key');
  });
});

describe('the dictionaries', () => {
  const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

  it.each(parts.map((part, i) => [Object.keys(part.en)[0]?.split('.')[0] ?? i, part]))(
    '%s has every text in every language, with the same placeholders',
    (_, part) => {
      const english = part.en;
      for (const { code } of LANGUAGES) {
        const texts = part[code];
        expect(Object.keys(texts ?? {}).sort(), code).toEqual(Object.keys(english).sort());
        for (const [key, text] of Object.entries(english)) {
          expect(texts[key].trim(), `${code} ${key}`).not.toBe('');
          expect(placeholders(texts[key]), `${code} ${key}`).toEqual(placeholders(text));
        }
      }
    }
  );

  it('keep each key in one part only', () => {
    const seen = new Map();
    for (const part of parts) {
      for (const key of Object.keys(part.en)) {
        expect(seen.has(key), key).toBe(false);
        seen.set(key, true);
      }
    }
  });
});

describe('I18nProvider', () => {
  function Shown() {
    const { t, setLanguage } = useI18n();
    return (
      <>
        <p>{t('app.reset')}</p>
        <button type="button" onClick={() => setLanguage('de')}>
          de
        </button>
      </>
    );
  }

  it('switches the texts, remembers the choice and sets the page language', () => {
    render(
      <I18nProvider initialLanguage="en">
        <Shown />
      </I18nProvider>
    );
    expect(screen.getByText('🔄 Reset Board')).toBeInTheDocument();

    act(() => screen.getByRole('button', { name: 'de' }).click());

    expect(screen.getByText('🔄 Brett zurücksetzen')).toBeInTheDocument();
    expect(localStorage.getItem('language')).toBe('de');
    expect(document.documentElement.lang).toBe('de');
  });
});
