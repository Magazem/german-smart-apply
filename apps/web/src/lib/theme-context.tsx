'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Theme = 'system' | 'light' | 'dark' | 'terminal';

const STORAGE_KEY = 'sa-theme';
// Whether the first-visit hint pointing at the theme toggle has been shown/
// dismissed yet - separate from STORAGE_KEY because "no theme stored" is a
// real, valid state (a fresh visitor defaulting to terminal), not the same
// thing as "never told them they can change it".
const HINT_SEEN_KEY = 'sa-theme-hint-seen';
const THEMES: Theme[] = ['system', 'light', 'dark', 'terminal'];
// Default for a fresh visitor with no stored preference yet. Mirrors the
// NO_FLASH_THEME_SCRIPT inline script in layout.tsx, which must apply this
// same default before hydration - keep the two in sync if this changes.
const DEFAULT_THEME: Theme = 'terminal';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  cycleTheme: () => void;
  showHint: boolean;
  dismissHint: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: Theme): void {
  if (theme === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && THEMES.includes(stored as Theme)) {
      setThemeState(stored as Theme);
    }
    if (!window.localStorage.getItem(HINT_SEEN_KEY)) {
      setShowHint(true);
    }
  }, []);

  const dismissHint = useCallback(() => {
    setShowHint(false);
    window.localStorage.setItem(HINT_SEEN_KEY, '1');
  }, []);

  const setTheme = useCallback(
    (next: Theme) => {
      setThemeState(next);
      window.localStorage.setItem(STORAGE_KEY, next);
      applyTheme(next);
      dismissHint();
    },
    [dismissHint],
  );

  const cycleTheme = useCallback(() => {
    setThemeState((current) => {
      const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
      window.localStorage.setItem(STORAGE_KEY, next);
      applyTheme(next);
      return next;
    });
    dismissHint();
  }, [dismissHint]);

  const value = useMemo(
    () => ({ theme, setTheme, cycleTheme, showHint, dismissHint }),
    [theme, setTheme, cycleTheme, showHint, dismissHint],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
