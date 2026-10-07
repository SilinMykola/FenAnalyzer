import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useTheme from './useTheme';

// Pretends the operating system prefers the given colour scheme.
function stubSystemTheme(scheme) {
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    matches: query === `(prefers-color-scheme: ${scheme})`,
    media: query,
  }));
}

beforeEach(() => {
  stubSystemTheme('dark');
});

afterEach(() => {
  delete document.documentElement.dataset.theme;
});

describe('useTheme', () => {
  it('follows the OS setting on a first visit', () => {
    stubSystemTheme('light');

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('light');
  });

  it('defaults to dark when the OS does not prefer light', () => {
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('dark');
  });

  it('prefers the saved choice over the OS setting', () => {
    stubSystemTheme('light');
    localStorage.setItem('theme', 'dark');

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('dark');
  });

  it('ignores a saved value that is not a theme', () => {
    stubSystemTheme('light');
    localStorage.setItem('theme', 'purple');

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('light');
  });

  it('applies the theme to <html> and remembers it', () => {
    renderHook(() => useTheme());

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('switches between dark and light', () => {
    const { result } = renderHook(() => useTheme());

    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('theme')).toBe('light');

    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe('dark');
  });

  it('still works when storage is blocked', () => {
    stubSystemTheme('light');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggleTheme());

    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
