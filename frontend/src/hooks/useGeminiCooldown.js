import { useEffect, useState } from 'react';

const STORAGE_KEY = 'gemini_cooldowns';

// { [model]: time in ms until which Gemini asked not to be called }. Kept in
// localStorage, so a day-long quota block survives a page reload.
function loadCooldowns() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return saved && typeof saved === 'object' ? saved : {};
  } catch {
    return {};
  }
}

/**
 * "12:21:44" for hours, "4:05" for minutes, "0:09" for seconds.
 */
export function formatCountdown(totalSeconds) {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/**
 * The pause Gemini asks for after refusing a request (overload or quota).
 * Quotas are per model, so each model has its own pause: switching to another
 * model lifts the wait.
 *
 * Returns secondsLeft for `model`, ticking down once a second, and
 * startCooldown(model, seconds) to begin a pause.
 */
export default function useGeminiCooldown(model) {
  const [cooldowns, setCooldowns] = useState(loadCooldowns);
  const [now, setNow] = useState(() => Date.now());

  const until = (model && cooldowns[model]) || 0;
  const secondsLeft = Math.max(0, Math.ceil((until - now) / 1000));

  // Tick while the pause lasts, then stop.
  useEffect(() => {
    if (until <= Date.now()) return undefined;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= until) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [until]);

  // Remember pauses that have not run out yet.
  useEffect(() => {
    const current = Date.now();
    const running = Object.fromEntries(Object.entries(cooldowns).filter(([, t]) => t > current));
    try {
      if (Object.keys(running).length) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(running));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Not saving only means the pause is forgotten on reload.
    }
  }, [cooldowns]);

  const startCooldown = (forModel, seconds) => {
    if (!forModel || !(seconds > 0)) return;
    const current = Date.now();
    setNow(current);
    setCooldowns((prev) => ({ ...prev, [forModel]: current + seconds * 1000 }));
  };

  return { secondsLeft, startCooldown };
}
