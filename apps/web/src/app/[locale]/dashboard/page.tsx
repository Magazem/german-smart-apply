'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useEffect, useState } from 'react';
import type { CandidateProfile, CanonicalJob, JobMatchScore, ParsedCvResult } from '@german-smart-apply/shared';
import { getApiClient } from '@/lib/api-client';
import { useRequireAuth } from '@/lib/use-require-auth';
import { JobCard } from '@/components/job-card';

export default function DashboardPage() {
  const t = useTranslations('Dashboard');
  const { user, loading: authLoading } = useRequireAuth();
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [parsedCv, setParsedCv] = useState<ParsedCvResult | null>(null);
  const [topJobs, setTopJobs] = useState<Array<{ job: CanonicalJob; match: JobMatchScore }>>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const api = getApiClient();
        const [p, cv] = await Promise.all([api.profile.get(), api.cv.getLastParsed()]);
        if (cancelled) return;
        setProfile(p);
        setParsedCv(cv);
        if (p?.targetRole) {
          const result = await api.jobs.search({ locationCountryCode: p.targetCountryCode, limit: 5 });
          if (cancelled) return;
          setTopJobs(result.jobs.map((job) => ({ job, match: result.matches[job.jobId] })));
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : t('loadError'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  if (authLoading) {
    return (
      <div className="container" style={{ padding: '48px 24px' }}>
        <p className="muted">{t('loading')}</p>
      </div>
    );
  }

  const needsOnboarding = !loading && profile && !profile.targetRole;

  return (
    <div className="container stack gap-24" style={{ padding: '40px 24px 96px' }}>
      <div className="row spread" style={{ alignItems: 'flex-end' }}>
        <div className="stack gap-4">
          <h1 style={{ fontSize: '1.7rem', fontWeight: 800 }}>
            {user?.fullName ? t('welcomeBackNamed', { fullName: user.fullName }) : t('welcomeBack')}
          </h1>
          <p className="muted">{t('subtitle')}</p>
        </div>
        {user?.tier === 'free' && (
          <Link href="/billing" className="btn btn-secondary btn-sm">
            {t('upgradeToPro')}
          </Link>
        )}
      </div>

      {loadError && (
        <div className="card" style={{ padding: 20 }}>
          <p className="error-text">{loadError}</p>
        </div>
      )}

      {needsOnboarding && (
        <div className="card" style={{ padding: 20 }}>
          <p>
            {t('onboardingIncomplete')}{' '}
            <Link href="/onboarding" style={{ color: 'var(--color-primary)', fontWeight: 700 }}>
              {t('finishOnboardingLink')}
            </Link>{' '}
            {t('unlockMatchedJobs')}
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: 24 }}>
        <div className="stack gap-16">
          <h2 style={{ fontWeight: 700, fontSize: '1.1rem' }}>{t('topMatchedJobs')}</h2>
          {loading ? (
            <div className="stack gap-12">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton" style={{ height: 140 }} />
              ))}
            </div>
          ) : topJobs.length === 0 ? (
            <div className="card" style={{ padding: 20 }}>
              <p className="muted">{t('noMatchesYet')}</p>
            </div>
          ) : (
            <div className="stack gap-16">
              {topJobs.map(({ job, match }) => (
                <JobCard key={job.jobId} job={job} match={match} whyMatch={match?.explanation} />
              ))}
            </div>
          )}
          <Link href="/jobs" className="btn btn-secondary" style={{ alignSelf: 'flex-start' }}>
            {t('seeAllJobs')}
          </Link>
        </div>

        <div className="stack gap-16">
          <div className="card stack gap-12" style={{ padding: 20 }}>
            <h2 style={{ fontWeight: 700, fontSize: '1.05rem' }}>{t('candidateSummary')}</h2>
            {profile ? (
              <div className="stack gap-8">
                <p style={{ fontSize: '0.9rem' }}>{profile.summary ?? t('noSummaryYet')}</p>
                <div className="row row-wrap gap-8">
                  {profile.skills.slice(0, 8).map((s) => (
                    <span key={s} className="tag">
                      {s}
                    </span>
                  ))}
                </div>
                <Link href="/cv" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start', padding: '4px 0' }}>
                  {t('editInCvWorkspace')}
                </Link>
              </div>
            ) : loadError ? (
              // Distinct from "haven't onboarded yet" below - profile.get()
              // now re-throws a real fetch failure instead of collapsing it
              // to null, so "no profile" and "couldn't check" are no longer
              // the same case and shouldn't share the same "go finish
              // onboarding" copy, which would be actively wrong here.
              <p className="muted">{t('profileLoadErrorSummary')}</p>
            ) : (
              <p className="muted">{t('completeOnboardingSummary')}</p>
            )}
          </div>

          <div className="card stack gap-12" style={{ padding: 20 }}>
            <h2 style={{ fontWeight: 700, fontSize: '1.05rem' }}>{t('cvSuggestionsTitle')}</h2>
            {parsedCv && parsedCv.suggestions.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {parsedCv.suggestions.map((s) => (
                  <li key={s} style={{ marginBottom: 6, fontSize: '0.88rem' }}>
                    {s}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">{t('uploadCvForSuggestions')}</p>
            )}
          </div>

          <div className="card stack gap-8" style={{ padding: 20 }}>
            <h2 style={{ fontWeight: 700, fontSize: '1.05rem' }}>{t('applicationPipeline')}</h2>
            <p className="muted" style={{ fontSize: '0.88rem' }}>
              {t('applicationPipelineHint')}
            </p>
            <Link href="/applications" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }}>
              {t('openApplicationQueue')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
