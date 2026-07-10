'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { CandidateProfile, CanonicalJob, JobMatchScore, ParsedCvResult } from '@german-smart-apply/shared';
import { getApiClient } from '@/lib/api-client';
import { useRequireAuth } from '@/lib/use-require-auth';
import { JobCard } from '@/components/job-card';

export default function DashboardPage() {
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
          setLoadError(err instanceof Error ? err.message : 'Could not load your dashboard.');
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
        <p className="muted">Loading…</p>
      </div>
    );
  }

  const needsOnboarding = !loading && profile && !profile.targetRole;

  return (
    <div className="container stack gap-24" style={{ padding: '40px 24px 96px' }}>
      <div className="row spread" style={{ alignItems: 'flex-end' }}>
        <div className="stack gap-4">
          <h1 style={{ fontSize: '1.7rem', fontWeight: 800 }}>Welcome back{user?.fullName ? `, ${user.fullName}` : ''}</h1>
          <p className="muted">Here's your candidate summary and today's top trusted matches.</p>
        </div>
        {user?.tier === 'free' && (
          <Link href="/billing" className="btn btn-secondary btn-sm">
            Upgrade to Pro
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
            You haven't finished onboarding yet.{' '}
            <Link href="/onboarding" style={{ color: 'var(--color-primary)', fontWeight: 700 }}>
              Finish the 5 quick questions
            </Link>{' '}
            to unlock matched jobs.
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: 24 }}>
        <div className="stack gap-16">
          <h2 style={{ fontWeight: 700, fontSize: '1.1rem' }}>Top matched jobs</h2>
          {loading ? (
            <div className="stack gap-12">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton" style={{ height: 140 }} />
              ))}
            </div>
          ) : topJobs.length === 0 ? (
            <div className="card" style={{ padding: 20 }}>
              <p className="muted">No matches yet — finish onboarding to see your top jobs.</p>
            </div>
          ) : (
            <div className="stack gap-16">
              {topJobs.map(({ job, match }) => (
                <JobCard key={job.jobId} job={job} match={match} whyMatch={match?.explanation} />
              ))}
            </div>
          )}
          <Link href="/jobs" className="btn btn-secondary" style={{ alignSelf: 'flex-start' }}>
            See all jobs &rarr;
          </Link>
        </div>

        <div className="stack gap-16">
          <div className="card stack gap-12" style={{ padding: 20 }}>
            <h2 style={{ fontWeight: 700, fontSize: '1.05rem' }}>Candidate summary</h2>
            {profile ? (
              <div className="stack gap-8">
                <p style={{ fontSize: '0.9rem' }}>{profile.summary ?? 'No summary yet.'}</p>
                <div className="row row-wrap gap-8">
                  {profile.skills.slice(0, 8).map((s) => (
                    <span key={s} className="tag">
                      {s}
                    </span>
                  ))}
                </div>
                <Link href="/cv" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start', padding: '4px 0' }}>
                  Edit in CV workspace &rarr;
                </Link>
              </div>
            ) : (
              <p className="muted">Complete onboarding to see your summary.</p>
            )}
          </div>

          <div className="card stack gap-12" style={{ padding: 20 }}>
            <h2 style={{ fontWeight: 700, fontSize: '1.05rem' }}>CV improvement suggestions</h2>
            {parsedCv && parsedCv.suggestions.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {parsedCv.suggestions.map((s) => (
                  <li key={s} style={{ marginBottom: 6, fontSize: '0.88rem' }}>
                    {s}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Upload a CV to get tailored suggestions.</p>
            )}
          </div>

          <div className="card stack gap-8" style={{ padding: 20 }}>
            <h2 style={{ fontWeight: 700, fontSize: '1.05rem' }}>Application pipeline</h2>
            <p className="muted" style={{ fontSize: '0.88rem' }}>
              Track drafts, approvals, and outcomes in one place. Nothing is submitted without your approval.
            </p>
            <Link href="/applications" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }}>
              Open application queue
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
