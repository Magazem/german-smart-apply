'use client';

import { useTranslations } from 'next-intl';
import { useTheme } from '@/lib/theme-context';

export function ThemeToggle() {
  const { theme, cycleTheme } = useTheme();
  const t = useTranslations('ThemeToggle');
  const label = theme === 'terminal' ? `${t('terminal')}_` : t(theme);

  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={cycleTheme}
      data-testid="theme-toggle"
      data-current-theme={theme}
      title={t('title')}
    >
      {label}
    </button>
  );
}
