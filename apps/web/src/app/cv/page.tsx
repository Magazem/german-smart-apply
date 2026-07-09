'use client';

import Link from 'next/link';
import { useEffect, useState, type CSSProperties } from 'react';
import type { Application, ApplicationDraft, CandidateProfile, CanonicalJob, ParsedCvResult } from '@german-smart-apply/shared';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { useRequireAuth } from '@/lib/use-require-auth';

export default function CvWorkspacePage() {
  const { loading: authLoading } = useRequireAuth();
  const { user } = useAuth();
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [parsedCv, setParsedCv] = useState<ParsedCvResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [applications, setApplications] = useState<Array<{ application: Application; job: CanonicalJob | null }>>([]);
  const [selectedAppId, setSelectedAppId] = useState<string>('');
  const [generating, setGenerating] = useState(false);
  const [generatedDraft, setGeneratedDraft] = useState<ApplicationDraft | null>(null);

  const isPro = user?.tier === 'pro';

  useEffect(() => {
    if (authLoading) return;
    (async () => {
      const api = getApiClient();
      const [p, cv, apps] = await Promise.all([api.profile.get(), api.cv.getLastParsed(), api.applications.list()]);
      setProfile(p);
      setParsedCv(cv);
      const withJobs = await Promise.all(
        apps.map(async (a) => ({ application: a, job: (await api.jobs.get(a.jobId))?.job ?? null })),
      );
      setApplications(withJobs);
      if (withJobs[0]) setSelectedAppId(withJobs[0].application.id);
      setLoading(false);
    })();
  }, [authLoading]);

  if (authLoading || loading || !profile) {
    return (
      <div className="container" style={{ padding: '48px 24px' }}>
        <div className="skeleton" style={{ height: 320 }} />
      </div>
    );
  }

  const update = (patch: Partial<CandidateProfile>) => setProfile((p) => (p ? { ...p, ...patch } : p));

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage(null);
    setError(null);
    try {
      const saved = await getApiClient().profile.update(profile);
      setProfile(saved);
      setSaveMessage('Profile saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async () => {
    if (!selectedAppId) return;
    setGenerating(true);
    setError(null);
    try {
      const draft = await getApiClient().applications.draft(selectedAppId);
      setGeneratedDraft(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate a tailored draft.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="container stack gap-24" style={{ maxWidth: 880, padding: '40px 24px 96px' }}>
      <div className="stack gap-4">
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>CV workspace</h1>
        <p className="muted">Review and edit your parsed profile, then generate tailored materials per job.</p>
      </div>

      {parsedCv && (
        <div className="card stack gap-8" style={{ padding: 20 }}>
          <h2 style={{ fontWeight: 700, fontSize: '1.02rem' }}>Original parsed CV</h2>
          <p className="muted" style={{ fontSize: '0.88rem' }}>{parsedCv.summary}</p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {parsedCv.suggestions.map((s) => (
              <li key={s} style={{ fontSize: '0.85rem', marginBottom: 4 }}>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card stack" style={{ padding: 24 }}>
        <h2 style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 16 }}>Your profile</h2>

        <div className="field">
          <label htmlFor="fullName">Full name</label>
          <input
            id="fullName"
            className="input"
            value={profile.fullName ?? ''}
            onChange={(e) => update({ fullName: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="targetRole">Target role</label>
          <input
            id="targetRole"
            className="input"
            value={profile.targetRole}
            onChange={(e) => update({ targetRole: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="summary">Summary</label>
          <textarea
            id="summary"
            className="textarea"
            rows={4}
            value={profile.summary ?? ''}
            onChange={(e) => update({ summary: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="skills">Skills (comma-separated)</label>
          <input
            id="skills"
            className="input"
            value={profile.skills.join(', ')}
            onChange={(e) => update({ skills: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
          />
        </div>
        <div className="row gap-16" style={{ flexWrap: 'wrap' }}>
          <div className="field" style={{ flex: 1, minWidth: 160 }}>
            <label htmlFor="seniority">Seniority</label>
            <select
              id="seniority"
              className="select"
              value={profile.seniority}
              onChange={(e) => update({ seniority: e.target.value })}
            >
              {['intern', 'junior', 'mid', 'senior', 'lead', 'principal'].map((s) => (
                <option key={s} value={s}>
                  {s[0].toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: 1, minWidth: 160 }}>
            <label htmlFor="locationPreference">Location preference</label>
            <select
              id="locationPreference"
              className="select"
              value={profile.locationPreference}
              onChange={(e) => update({ locationPreference: e.target.value as CandidateProfile['locationPreference'] })}
            >
              <option value="onsite">On-site</option>
              <option value="hybrid">Hybrid</option>
              <option value="remote">Remote</option>
              <option value="any">Any</option>
            </select>
          </div>
        </div>

        <div className="stack gap-8" style={{ marginTop: 8, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
          <div className="row gap-8" style={{ alignItems: 'center' }}>
            <h3 style={{ fontWeight: 700, fontSize: '0.95rem' }}>Deeper profile settings</h3>
            <span className="badge badge-neutral">Pro</span>
          </div>
          {!isPro && (
            <p className="muted" style={{ fontSize: '0.85rem' }}>
              Salary targets, work authorization, blacklists, commute preferences, and portfolio links unlock on
              Pro. <Link href="/billing" style={{ color: 'var(--color-primary)', fontWeight: 700 }}>Upgrade to Pro</Link>.
            </p>
          )}

          <div className="row gap-16" style={{ flexWrap: 'wrap', opacity: isPro ? 1 : 0.5 }}>
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label htmlFor="salaryMin">Salary target min (EUR)</label>
              <input
                id="salaryMin"
                type="number"
                className="input"
                disabled={!isPro}
                value={profile.salaryTargetMin ?? ''}
                onChange={(e) => update({ salaryTargetMin: e.target.value ? Number(e.target.value) : null })}
              />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label htmlFor="salaryMax">Salary target max (EUR)</label>
              <input
                id="salaryMax"
                type="number"
                className="input"
                disabled={!isPro}
                value={profile.salaryTargetMax ?? ''}
                onChange={(e) => update({ salaryTargetMax: e.target.value ? Number(e.target.value) : null })}
              />
            </div>
          </div>
          <div className="field" style={{ opacity: isPro ? 1 : 0.5 }}>
            <label htmlFor="workAuth">Work authorization</label>
            <input
              id="workAuth"
              className="input"
              disabled={!isPro}
              value={profile.workAuthorization ?? ''}
              onChange={(e) => update({ workAuthorization: e.target.value })}
            />
          </div>
          <div className="field" style={{ opacity: isPro ? 1 : 0.5 }}>
            <label htmlFor="commute">Commute preference (km)</label>
            <input
              id="commute"
              type="number"
              className="input"
              disabled={!isPro}
              value={profile.commutePreferenceKm ?? ''}
              onChange={(e) => update({ commutePreferenceKm: e.target.value ? Number(e.target.value) : null })}
            />
          </div>
          <div className="field" style={{ opacity: isPro ? 1 : 0.5 }}>
            <label htmlFor="portfolio">Portfolio links (comma-separated)</label>
            <input
              id="portfolio"
              className="input"
              disabled={!isPro}
              value={profile.portfolioLinks.join(', ')}
              onChange={(e) => update({ portfolioLinks: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
            />
          </div>
        </div>

        {error && <p className="error-text" style={{ marginTop: 12 }}>{error}</p>}
        {saveMessage && <p className="muted" style={{ marginTop: 12, fontSize: '0.85rem' }}>{saveMessage}</p>}

        <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ marginTop: 16, alignSelf: 'flex-start' }}>
          {saving ? 'Saving…' : 'Save profile'}
        </button>
      </div>

      <div className="card stack gap-12" style={{ padding: 24 }}>
        <h2 style={{ fontWeight: 700, fontSize: '1.05rem' }}>Generate a tailored variant</h2>
        {applications.length === 0 ? (
          <p className="muted" style={{ fontSize: '0.88rem' }}>
            Save a job from <Link href="/jobs">job search</Link> first, then come back to generate tailored materials
            for it.
          </p>
        ) : (
          <>
            <div className="field">
              <label htmlFor="jobSelect">Choose a tracked job</label>
              <select
                id="jobSelect"
                className="select"
                value={selectedAppId}
                onChange={(e) => setSelectedAppId(e.target.value)}
              >
                {applications.map(({ application, job }) => (
                  <option key={application.id} value={application.id}>
                    {job ? `${job.jobTitleNormalized} — ${job.companyNameNormalized}` : 'Unknown job'}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className="btn btn-primary" onClick={handleGenerate} disabled={generating} style={{ alignSelf: 'flex-start' }}>
              {generating ? 'Generating…' : 'Generate tailored CV & cover letter'}
            </button>

            {generatedDraft && (
              <div className="stack gap-12" style={{ marginTop: 8 }}>
                <div className="stack gap-6">
                  <strong style={{ fontSize: '0.88rem' }}>CV variant</strong>
                  <pre style={preStyle}>{generatedDraft.cvVariantText}</pre>
                </div>
                <div className="stack gap-6">
                  <strong style={{ fontSize: '0.88rem' }}>Cover letter</strong>
                  <pre style={preStyle}>{generatedDraft.coverLetterText}</pre>
                </div>
                <p className="muted" style={{ fontSize: '0.82rem' }}>
                  This draft now needs your approval.{' '}
                  <Link href="/applications" style={{ color: 'var(--color-primary)', fontWeight: 700 }}>
                    Go review it in the application queue &rarr;
                  </Link>
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const preStyle: CSSProperties = {
  whiteSpace: 'pre-wrap',
  fontFamily: 'var(--font-sans)',
  fontSize: '0.85rem',
  background: 'var(--color-surface-alt)',
  padding: 14,
  borderRadius: 'var(--radius-md)',
  margin: 0,
};
