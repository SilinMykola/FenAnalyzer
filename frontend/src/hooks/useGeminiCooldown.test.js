import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useGeminiCooldown, { formatCountdown } from './useGeminiCooldown';

describe('formatCountdown', () => {
  it.each([
    [0, '0:00'],
    [9, '0:09'],
    [65, '1:05'],
    [3600, '1:00:00'],
    [12 * 3600 + 21 * 60 + 45, '12:21:45'],
    [4.2, '0:05'],
    [-3, '0:00'],
  ])('shows %s seconds as %s', (seconds, text) => {
    expect(formatCountdown(seconds)).toBe(text);
  });
});

describe('useGeminiCooldown', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] }));
  afterEach(() => vi.useRealTimers());

  it('has no pause at first', () => {
    const { result } = renderHook(() => useGeminiCooldown('gemini-a'));

    expect(result.current.secondsLeft).toBe(0);
  });

  it('counts a pause down to zero', () => {
    const { result } = renderHook(() => useGeminiCooldown('gemini-a'));

    act(() => result.current.startCooldown('gemini-a', 3));
    expect(result.current.secondsLeft).toBe(3);

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.secondsLeft).toBe(2);

    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.secondsLeft).toBe(0);
  });

  it('keeps a pause for each model', () => {
    const { result, rerender } = renderHook(({ model }) => useGeminiCooldown(model), {
      initialProps: { model: 'gemini-a' },
    });
    act(() => result.current.startCooldown('gemini-a', 60));

    rerender({ model: 'gemini-b' });
    expect(result.current.secondsLeft).toBe(0);

    rerender({ model: 'gemini-a' });
    expect(result.current.secondsLeft).toBe(60);
  });

  it('remembers a running pause in the browser and drops it once over', () => {
    const { result, unmount } = renderHook(() => useGeminiCooldown('gemini-a'));
    act(() => result.current.startCooldown('gemini-a', 30));
    unmount();

    const again = renderHook(() => useGeminiCooldown('gemini-a'));
    expect(again.result.current.secondsLeft).toBe(30);

    // Once over, the pause is dropped the next time pauses are saved.
    act(() => vi.advanceTimersByTime(30_000));
    act(() => again.result.current.startCooldown('gemini-b', 10));
    expect(Object.keys(JSON.parse(localStorage.getItem('gemini_cooldowns')))).toEqual(['gemini-b']);
  });

  it('ignores a pause without a model or a length', () => {
    const { result } = renderHook(() => useGeminiCooldown(null));

    act(() => result.current.startCooldown(null, 30));
    act(() => result.current.startCooldown('gemini-a', 0));

    expect(result.current.secondsLeft).toBe(0);
    expect(localStorage.getItem('gemini_cooldowns')).toBeNull();
  });

  it('survives unreadable saved data', () => {
    localStorage.setItem('gemini_cooldowns', '{not json');

    const { result } = renderHook(() => useGeminiCooldown('gemini-a'));

    expect(result.current.secondsLeft).toBe(0);
  });
});
