'use client';

import { useTranslations } from 'next-intl';
import { useTheme } from '@/lib/theme-context';

/** One-time strip pointing new visitors at the theme toggle - dismissible, and auto-dismisses the moment they actually use it (see dismissHint calls in theme-context.tsx). */
export function ThemeHint() {
  const { showHint, dismissHint } = useTheme();
  const t = useTranslations('ThemeHint');

  if (!showHint) return null;

  return (
    <div
      role="note"
      style={{
        background: 'var(--color-info-bg)',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <div
        className="container row spread"
        style={{ padding: '10px 24px', fontSize: '0.82rem', alignItems: 'center' }}
      >
        <span className="row gap-8">
          <span aria-hidden>🎨</span>
          <span className="muted">{t('message')}</span>
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={dismissHint}
          aria-label={t('dismiss')}
          data-testid="theme-hint-dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
