import { useTranslations } from 'next-intl';

export function TrustStrip() {
  const t = useTranslations('TrustStrip');
  return (
    <div
      role="note"
      style={{
        background: 'var(--color-info-bg)',
        borderTop: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <div className="container row gap-8" style={{ padding: '10px 24px', fontSize: '0.82rem' }}>
        <span aria-hidden>🛡️</span>
        <span className="muted">{t('message')}</span>
      </div>
    </div>
  );
}
