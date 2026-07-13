import { useTranslations } from 'next-intl';
import type { JobMatchScore } from '@german-smart-apply/shared';

export function MatchScoreBar({ match, compact }: { match: JobMatchScore | null | undefined; compact?: boolean }) {
  const t = useTranslations('MatchScore');
  if (!match) return null;
  const pct = Math.round(match.totalScore * 100);
  const color = pct >= 70 ? 'var(--color-success)' : pct >= 45 ? 'var(--color-accent)' : 'var(--color-text-muted)';
  return (
    <div className="row gap-8" data-testid="match-score" data-match-score={pct}>
      <div
        aria-hidden
        style={{
          width: compact ? 44 : 56,
          height: compact ? 44 : 56,
          borderRadius: '50%',
          background: `conic-gradient(${color} ${pct * 3.6}deg, var(--color-surface-alt) 0deg)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: compact ? 34 : 44,
            height: compact ? 34 : 44,
            borderRadius: '50%',
            background: 'var(--color-surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: compact ? '0.72rem' : '0.85rem',
          }}
        >
          {pct}%
        </div>
      </div>
      {!compact && <span className="muted" style={{ fontSize: '0.82rem' }}>{t('matchScoreLabel')}</span>}
    </div>
  );
}

export function MatchBreakdown({ match }: { match: JobMatchScore }) {
  const t = useTranslations('MatchScore');
  const rows: Array<[string, number]> = [
    [t('titleFit'), match.titleSimilarity],
    [t('skillOverlap'), match.skillOverlap],
    [t('locationFit'), match.locationFit],
    [t('recency'), match.recencmyBoost],
    [t('salaryFit'), match.salaryFit],
    [t('languageFit'), match.languageFit],
    [t('sourceTrust'), match.sourceTrust],
  ];
  return (
    <div className="stack gap-8">
      {rows.map(([label, value]) => (
        <div key={label} className="row gap-8">
          <span className="muted" style={{ fontSize: '0.8rem', width: 100, flexShrink: 0 }}>
            {label}
          </span>
          <div
            style={{
              flex: 1,
              height: 6,
              borderRadius: 999,
              background: 'var(--color-surface-alt)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${Math.round(value * 100)}%`,
                height: '100%',
                background: 'var(--color-primary)',
              }}
            />
          </div>
        </div>
      ))}
      {match.riskPenalty > 0 && (
        <div className="row gap-8">
          <span className="muted" style={{ fontSize: '0.8rem', width: 100, flexShrink: 0 }}>
            {t('riskPenalty')}
          </span>
          <div
            style={{
              flex: 1,
              height: 6,
              borderRadius: 999,
              background: 'var(--color-surface-alt)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{ width: `${Math.round(match.riskPenalty * 100)}%`, height: '100%', background: 'var(--color-danger)' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
