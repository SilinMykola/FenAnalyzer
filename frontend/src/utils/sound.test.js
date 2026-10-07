import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// sound.js keeps one AudioContext in a module-level variable. To give every
// test a fresh module (and so a fresh, unset variable) the module is imported
// anew after vi.resetModules() instead of once at the top of the file.
async function loadSound() {
  vi.resetModules();
  return import('./sound');
}

// A fake Web Audio context that records what the code asks of it.
function createFakeAudioContext({ state = 'running' } = {}) {
  const oscillators = [];
  const ctx = {
    state,
    currentTime: 10,
    destination: { name: 'speakers' },
    resume: vi.fn(),
    createOscillator: vi.fn(() => {
      const osc = {
        type: null,
        frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(osc);
      return osc;
    }),
    createGain: vi.fn(() => ({
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
    })),
  };
  return { ctx, oscillators };
}

let fake;
let AudioContextMock;

beforeEach(() => {
  fake = createFakeAudioContext();
  // A regular function, not an arrow: the code calls it with `new`.
  AudioContextMock = vi.fn(function AudioContext() {
    return fake.ctx;
  });
  vi.stubGlobal('AudioContext', AudioContextMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('playMoveSound', () => {
  it('plays a low sine thud for a normal move', async () => {
    const { playMoveSound } = await loadSound();

    playMoveSound();

    const [osc] = fake.oscillators;
    expect(osc.type).toBe('sine');
    expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(320, 10);
    expect(osc.start).toHaveBeenCalled();
    expect(osc.stop).toHaveBeenCalledWith(10.08);
  });

  it('plays a sharper triangle tone for a capture', async () => {
    const { playMoveSound } = await loadSound();

    playMoveSound(true);

    const [osc] = fake.oscillators;
    expect(osc.type).toBe('triangle');
    expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(420, 10);
  });

  it('routes the tone through a gain node to the speakers', async () => {
    const { playMoveSound } = await loadSound();

    playMoveSound();

    const gain = fake.ctx.createGain.mock.results[0].value;
    expect(fake.oscillators[0].connect).toHaveBeenCalledWith(gain);
    expect(gain.connect).toHaveBeenCalledWith(fake.ctx.destination);
  });

  it('creates the audio context once and reuses it', async () => {
    const { playMoveSound } = await loadSound();

    playMoveSound();
    playMoveSound(true);

    expect(AudioContextMock).toHaveBeenCalledTimes(1);
    expect(fake.oscillators).toHaveLength(2);
  });

  it('wakes up a context the browser has suspended', async () => {
    fake = createFakeAudioContext({ state: 'suspended' });
    const { playMoveSound } = await loadSound();

    playMoveSound();

    expect(fake.ctx.resume).toHaveBeenCalled();
  });

  it('does not resume a context that is already running', async () => {
    const { playMoveSound } = await loadSound();

    playMoveSound();

    expect(fake.ctx.resume).not.toHaveBeenCalled();
  });

  it('falls back to the prefixed webkitAudioContext', async () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', AudioContextMock);
    const { playMoveSound } = await loadSound();

    playMoveSound();

    expect(AudioContextMock).toHaveBeenCalledTimes(1);
  });

  it('stays silent when the browser has no Web Audio', async () => {
    vi.stubGlobal('AudioContext', undefined);
    const { playMoveSound } = await loadSound();

    expect(() => playMoveSound()).not.toThrow();
  });

  it('swallows audio errors instead of breaking the move', async () => {
    fake.ctx.createOscillator.mockImplementation(() => {
      throw new Error('autoplay blocked');
    });
    const { playMoveSound } = await loadSound();

    expect(() => playMoveSound()).not.toThrow();
  });
});
