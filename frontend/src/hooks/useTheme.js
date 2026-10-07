import { useEffect, useState } from 'react';

const STORAGE_KEY = 'theme';

// The saved choice wins; on a first visit follow the operating system setting.
// index.html applies the same rule before React loads, so the page does not
// flash the wrong theme on reload.
function getInitialTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Storage can be blocked (private mode); fall through to the OS setting.
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/**
 * Current color theme ('dark' or 'light') and a function to switch it.
 * The theme is applied as data-theme on <html>, which the CSS variables in
 * index.css respond to, and remembered in localStorage.
 */
export default function useTheme() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Not saving only means the choice is forgotten on reload.
    }
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  return { theme, toggleTheme };
}
