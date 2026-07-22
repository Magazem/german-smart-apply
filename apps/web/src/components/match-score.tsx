import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { JobMatchScore } from '@german-smart-apply/shared';
import { Link } from '@/i18n/navigation';

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

export function MatchBreakdown({ match, isPro }: { match: JobMatchScore; isPro: boolean }) {
  const t = useTranslations('MatchScore');

  // Why salaryFit's row shows a message instead of a bar, and why the
  // message differs from the other dimensions' generic "no data": the reason
  // matters (a candidate can act on "set a salary target," not on "this job
  // doesn't disclose one"), and free vs. Pro changes the message - see
  // ranking.service.ts's salaryFit()/SalaryFitUnavailableReason comments for
  // why this is the common case for free-tier users, not an edge case.
  let salaryNote: ReactNode = null;
  if (match.salaryFit == null) {
    if (match.salaryFitUnavailableReason === 'no_job_salary') {
      salaryNote = t('salaryNotCountedNoJobRange');
    } else if (!isPro) {
      salaryNote = (
        <>
          {t('salaryNotCountedFree')}{' '}
          <Link href="/billing" style={{ color: 'var(--color-primary)', fontWeight: 700 }}>
            {t('upgradeCta')}
          </Link>
        </>
      );
    } else {
      salaryNote = t('salaryNotCountedSetTarget');
    }
  }

  const rows: Array<[string, number | null, string | null]> = [
    [t('titleFit'), match.titleSimilarity, null],
    [t('skillOverlap'), match.skillOverlap, null],
    [t('locationFit'), match.locationFit, null],
    [t('recency'), match.recencmyBoost, null],
    [t('salaryFit'), match.salaryFit, 'salary'],
    [t('languageFit'), match.languageFit, null],
    [t('sourceTrust'), match.sourceTrust, null],
  ];
  return (
    <div className="stack gap-8">
      {rows.map(([label, value, kind]) => (
        <div key={label} className="row gap-8">
          <span className="muted" style={{ fontSize: '0.8rem', width: 100, flexShrink: 0 }}>
            {label}
          </span>
          {value == null ? (
            <span className="muted" style={{ fontSize: '0.78rem', fontStyle: 'italic' }}>
              {kind === 'salary' ? salaryNote : t('noData')}
            </span>
          ) : (
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
          )}
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
