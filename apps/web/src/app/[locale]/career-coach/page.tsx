'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState, type FormEvent } from 'react';
import type { RoleGapAnalysis } from '@german-smart-apply/shared';
import { useRequireAuth } from '@/lib/use-require-auth';
import { getApiClient } from '@/lib/api-client';

function ReadinessGauge({ score, label }: { score: number; label: string }) {
  const color =
    score >= 70 ? 'var(--color-success)' : score >= 40 ? 'var(--color-accent)' : 'var(--color-danger)';
  return (
    <div className="stack gap-4" style={{ alignItems: 'center', flexShrink: 0 }}>
      <div
        aria-hidden
        data-testid="readiness-gauge"
        style={{
          width: 72,
          height: 72,
          borderRadius: '50%',
          background: `conic-gradient(${color} ${score * 3.6}deg, var(--color-surface-alt) 0deg)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: 'var(--color-surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: '0.95rem',
          }}
        >
          {Math.round(score)}%
        </div>
      </div>
      <span className="muted" style={{ fontSize: '0.72rem' }}>
        {label}
      </span>
    </div>
  );
}

export default function CareerCoachPage() {
  const t = useTranslations('CareerCoach');
  const { loading } = useRequireAuth();
  const [targetRole, setTargetRole] = useState('');
  const [analyses, setAnalyses] = useState<RoleGapAnalysis[]>([]);
  const [selected, setSelected] = useState<RoleGapAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    const api = getApiClient();
    Promise.all([api.profile.get(), api.roleGapAnalysis.list()])
      .then(([profile, list]) => {
        if (cancelled) return;
        if (profile?.targetRole) setTargetRole(profile.targetRole);
        setAnalyses(list);
        if (list.length > 0) setSelected(list[0]);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loading]);

  const handleAnalyze = async (e: FormEvent) => {
    e.preventDefault();
    if (!targetRole.trim() || analyzing) return;
    setAnalyzing(true);
    setError(null);
    try {
      const result = await getApiClient().roleGapAnalysis.create(targetRole.trim());
      setAnalyses((prev) => [result, ...prev]);
      setSelected(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) {
    return (
      <div className="container" style={{ padding: '48px 24px' }}>
        <p className="muted">{t('loading')}</p>
      </div>
    );
  }

  return (
    <div className="container stack gap-24" style={{ padding: '40px 24px 96px' }}>
      <div className="stack gap-4">
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>{t('pageTitle')}</h1>
        <p className="muted">{t('pageSubtitle')}</p>
      </div>

      <form onSubmit={handleAnalyze} className="card stack gap-16" style={{ padding: 28 }}>
        <div className="stack gap-4">
          <label htmlFor="targetRole" style={{ fontWeight: 700, fontSize: '0.9rem' }}>
            {t('targetRoleLabel')}
          </label>
          <input
            id="targetRole"
            className="input"
            value={targetRole}
            onChange={(e) => setTargetRole(e.target.value)}
            placeholder={t('targetRolePlaceholder')}
            data-testid="career-coach-target-role"
          />
        </div>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={analyzing || !targetRole.trim()}
          data-testid="career-coach-analyze"
        >
          {analyzing ? t('analyzing') : t('analyzeButton')}
        </button>
        {error && (
          <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem' }} role="alert">
            {error}
          </p>
        )}
      </form>

      {selected && (
        <div className="card stack gap-20" style={{ padding: 28 }} data-testid="career-coach-result">
          <div className="row spread" style={{ alignItems: 'flex-start' }}>
            <div className="stack gap-4">
              <h2 style={{ fontWeight: 800, fontSize: '1.2rem' }}>{selected.targetRole}</h2>
              <p className="muted" style={{ fontSize: '0.82rem' }}>
                {t('basedOnSamples', { count: selected.sampleJobCount })}
              </p>
            </div>
            <ReadinessGauge score={selected.estimatedReadinessScore} label={t('readinessLabel')} />
          </div>

          <p style={{ fontSize: '0.95rem' }}>{selected.summary}</p>

          <div className="stack gap-8">
            <h3 style={{ fontWeight: 700, fontSize: '0.95rem' }}>{t('matchingSkillsTitle')}</h3>
            {selected.matchingSkills.length === 0 ? (
              <p className="muted" style={{ fontSize: '0.85rem' }}>
                {t('noMatchingSkills')}
              </p>
            ) : (
              <div className="row row-wrap gap-8">
                {selected.matchingSkills.map((s) => (
                  <span key={s} className="tag" style={{ color: 'var(--color-success)' }}>
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="stack gap-8">
            <h3 style={{ fontWeight: 700, fontSize: '0.95rem' }}>{t('missingSkillsTitle')}</h3>
            {selected.missingSkills.length === 0 ? (
              <p className="muted" style={{ fontSize: '0.85rem' }}>
                {t('noMissingSkills')}
              </p>
            ) : (
              <div className="row row-wrap gap-8">
                {selected.missingSkills.map((s) => (
                  <span key={s} className="tag" style={{ color: 'var(--color-danger)' }}>
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>

          {selected.suggestedLearningTopics.length > 0 && (
            <div className="stack gap-8">
              <h3 style={{ fontWeight: 700, fontSize: '0.95rem' }}>{t('learningTopicsTitle')}</h3>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {selected.suggestedLearningTopics.map((topic, i) => (
                  <li key={i} style={{ fontSize: '0.88rem', marginBottom: 6 }}>
                    {topic}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {selected.suggestedCertifications.length > 0 && (
            <div className="stack gap-8">
              <h3 style={{ fontWeight: 700, fontSize: '0.95rem' }}>{t('certificationsTitle')}</h3>
              <div className="row row-wrap gap-8">
                {selected.suggestedCertifications.map((c) => (
                  <span key={c} className="tag">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!loadingHistory && analyses.length > 1 && (
        <div className="stack gap-12">
          <h2 style={{ fontWeight: 700, fontSize: '1.05rem' }}>{t('historyTitle')}</h2>
          <div className="stack gap-8">
            {analyses.map((a) => (
              <button
                key={a.id}
                type="button"
                className="card row spread"
                style={{
                  padding: 16,
                  textAlign: 'left',
                  cursor: 'pointer',
                  border: a.id === selected?.id ? '2px solid var(--color-primary)' : undefined,
                }}
                onClick={() => setSelected(a)}
                data-testid="career-coach-history-item"
              >
                <span>
                  <strong>{a.targetRole}</strong>{' '}
                  <span className="muted" style={{ fontSize: '0.8rem' }}>
                    {new Date(a.createdAt).toLocaleDateString()}
                  </span>
                </span>
                <span className="badge badge-neutral">
                  {t('readinessScoreShort', { score: Math.round(a.estimatedReadinessScore) })}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!loadingHistory && analyses.length === 0 && !selected && (
        <p className="muted" style={{ fontSize: '0.88rem' }}>
          {t('emptyState')}
        </p>
      )}
    </div>
  );
}
