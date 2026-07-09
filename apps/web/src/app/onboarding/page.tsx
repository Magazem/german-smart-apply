'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import type {
  Application,
  ApplicationDraft,
  CandidateProfile,
  CanonicalJob,
  JobMatchScore,
  ParsedCvResult,
  Seniority,
} from '@german-smart-apply/shared';
import { getApiClient } from '@/lib/api-client';
import { useRequireAuth } from '@/lib/use-require-auth';
import { JobCard } from '@/components/job-card';

type Step = 1 | 2 | 3;

const SENIORITY_OPTIONS: Seniority[] = ['intern', 'junior', 'mid', 'senior', 'lead', 'principal'];

interface Answers {
  targetRole: string;
  targetCountryCode: string;
  preferredLanguage: string;
  seniority: Seniority;
  locationPreference: CandidateProfile['locationPreference'];
}

export default function OnboardingPage() {
  const { loading } = useRequireAuth();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>(1);
  const [cvMode, setCvMode] = useState<'file' | 'text'>('file');
  const [cvText, setCvText] = useState('');
  const [parsedCv, setParsedCv] = useState<ParsedCvResult | null>(null);
  const [parsing, setParsing] = useState(false);
  const [cvError, setCvError] = useState<string | null>(null);

  const [answers, setAnswers] = useState<Answers>({
    targetRole: '',
    targetCountryCode: 'DE',
    preferredLanguage: 'en',
    seniority: 'mid',
    locationPreference: 'hybrid',
  });
  const [submittingAnswers, setSubmittingAnswers] = useState(false);
  const [answersError, setAnswersError] = useState<string | null>(null);

  const [topJobs, setTopJobs] = useState<Array<{ job: CanonicalJob; match: JobMatchScore }>>([]);
  const [exampleDraft, setExampleDraft] = useState<ApplicationDraft | null>(null);
  const [exampleJob, setExampleJob] = useState<CanonicalJob | null>(null);
  const [exampleApp, setExampleApp] = useState<Application | null>(null);

  if (loading) {
    return (
      <div className="container" style={{ padding: '64px 24px' }}>
        <p className="muted">Loading…</p>
      </div>
    );
  }

  const handleParse = async () => {
    setCvError(null);
    setParsing(true);
    try {
      const api = getApiClient();
      let result: ParsedCvResult;
      if (cvMode === 'file') {
        const file = fileInputRef.current?.files?.[0];
        if (!file) {
          setCvError('Choose a CV file first, or switch to "paste text".');
          setParsing(false);
          return;
        }
        result = await api.cv.upload({ kind: 'file', file });
      } else {
        if (!cvText.trim()) {
          setCvError('Paste some CV text first.');
          setParsing(false);
          return;
        }
        result = await api.cv.upload({ kind: 'text', text: cvText });
      }
      setParsedCv(result);
      if (result.fullName) {
        await api.profile.update({ fullName: result.fullName, skills: result.skills, summary: result.summary });
      } else {
        await api.profile.update({ skills: result.skills, summary: result.summary });
      }
    } catch (err) {
      setCvError(err instanceof Error ? err.message : 'Could not parse that CV.');
    } finally {
      setParsing(false);
    }
  };

  const handleAnswers = async (e: FormEvent) => {
    e.preventDefault();
    setAnswersError(null);
    setSubmittingAnswers(true);
    try {
      const api = getApiClient();
      const profile = await api.profile.update({
        targetRole: answers.targetRole,
        targetCountryCode: answers.targetCountryCode,
        preferredLanguage: answers.preferredLanguage,
        seniority: answers.seniority,
        locationPreference: answers.locationPreference,
      });

      const searchResult = await api.jobs.search({
        locationCountryCode: profile.targetCountryCode,
        limit: 5,
      });
      const jobs = searchResult.jobs.map((job) => ({ job, match: searchResult.matches[job.jobId] }));
      setTopJobs(jobs);

      if (jobs[0]) {
        const app = await api.applications.create(jobs[0].job.jobId);
        const draft = await api.applications.draft(app.id);
        setExampleApp(app);
        setExampleJob(jobs[0].job);
        setExampleDraft(draft);
      }

      setStep(3);
    } catch (err) {
      setAnswersError(err instanceof Error ? err.message : 'Could not save your answers.');
    } finally {
      setSubmittingAnswers(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: 760, padding: '48px 24px 96px' }}>
      <ProgressHeader step={step} />

      {step === 1 && (
        <section className="card stack gap-16" style={{ padding: 32, marginTop: 24 }}>
          <div className="stack gap-4">
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Upload your CV</h1>
            <p className="muted" style={{ fontSize: '0.9rem' }}>
              We'll parse it into a starter profile — skills, summary, and a few quick improvement tips.
            </p>
          </div>

          <div className="row gap-8">
            <button
              type="button"
              className={`btn btn-sm ${cvMode === 'file' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setCvMode('file')}
            >
              Upload a file
            </button>
            <button
              type="button"
              className={`btn btn-sm ${cvMode === 'text' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setCvMode('text')}
            >
              Paste text instead
            </button>
          </div>

          {cvMode === 'file' ? (
            <div className="field">
              <label htmlFor="cv-file">CV file (.txt, .pdf)</label>
              <input
                id="cv-file"
                ref={fileInputRef}
                type="file"
                accept=".txt,.pdf,.md"
                className="input"
                data-testid="cv-file-input"
              />
            </div>
          ) : (
            <div className="field">
              <label htmlFor="cv-text">Paste your CV text</label>
              <textarea
                id="cv-text"
                className="textarea"
                rows={8}
                value={cvText}
                onChange={(e) => setCvText(e.target.value)}
                data-testid="cv-text-input"
                placeholder={'Jane Doe\nSkills: TypeScript, React, Node.js\n...'}
              />
            </div>
          )}

          {cvError && <p className="error-text">{cvError}</p>}

          {parsedCv && (
            <div className="card stack gap-8" style={{ padding: 16, background: 'var(--color-surface-alt)' }}>
              <strong>Parsed: {parsedCv.fullName ?? 'Your profile'}</strong>
              <p className="muted" style={{ fontSize: '0.88rem' }}>
                {parsedCv.summary}
              </p>
              <div className="row row-wrap gap-8">
                {parsedCv.skills.map((s) => (
                  <span key={s} className="tag">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="row spread">
            <span />
            <div className="row gap-8">
              {!parsedCv && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleParse}
                  disabled={parsing}
                  data-testid="parse-cv-button"
                >
                  {parsing ? 'Parsing…' : 'Parse my CV'}
                </button>
              )}
              {parsedCv && (
                <button type="button" className="btn btn-primary" onClick={() => setStep(2)} data-testid="onboarding-continue-step2">
                  Continue
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="card stack gap-16" style={{ padding: 32, marginTop: 24 }}>
          <div className="stack gap-4">
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Five quick questions</h1>
            <p className="muted" style={{ fontSize: '0.9rem' }}>
              This is it — no long questionnaire. Answer these and we'll show your matches.
            </p>
          </div>

          <form onSubmit={handleAnswers} className="stack">
            <div className="field">
              <label htmlFor="targetRole">1. Target role</label>
              <input
                id="targetRole"
                required
                className="input"
                value={answers.targetRole}
                onChange={(e) => setAnswers((a) => ({ ...a, targetRole: e.target.value }))}
                placeholder="e.g. Backend Engineer"
                data-testid="onboarding-target-role"
              />
            </div>
            <div className="field">
              <label htmlFor="targetCountryCode">2. Country</label>
              <select
                id="targetCountryCode"
                className="select"
                value={answers.targetCountryCode}
                onChange={(e) => setAnswers((a) => ({ ...a, targetCountryCode: e.target.value }))}
                data-testid="onboarding-country"
              >
                <option value="DE">Germany</option>
                <option value="FR" disabled>
                  France (coming soon)
                </option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="preferredLanguage">3. Preferred language</label>
              <select
                id="preferredLanguage"
                className="select"
                value={answers.preferredLanguage}
                onChange={(e) => setAnswers((a) => ({ ...a, preferredLanguage: e.target.value }))}
                data-testid="onboarding-language"
              >
                <option value="en">English</option>
                <option value="de">Deutsch</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="seniority">4. Seniority</label>
              <select
                id="seniority"
                className="select"
                value={answers.seniority}
                onChange={(e) => setAnswers((a) => ({ ...a, seniority: e.target.value as Seniority }))}
                data-testid="onboarding-seniority"
              >
                {SENIORITY_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s[0].toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="locationPreference">5. Location / remote preference</label>
              <select
                id="locationPreference"
                className="select"
                value={answers.locationPreference}
                onChange={(e) =>
                  setAnswers((a) => ({
                    ...a,
                    locationPreference: e.target.value as CandidateProfile['locationPreference'],
                  }))
                }
                data-testid="onboarding-location-pref"
              >
                <option value="onsite">On-site</option>
                <option value="hybrid">Hybrid</option>
                <option value="remote">Remote</option>
                <option value="any">Any</option>
              </select>
            </div>

            {answersError && <p className="error-text">{answersError}</p>}

            <div className="row spread">
              <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>
                Back
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submittingAnswers}
                data-testid="onboarding-see-matches"
              >
                {submittingAnswers ? 'Finding your matches…' : 'See my matches'}
              </button>
            </div>
          </form>
        </section>
      )}

      {step === 3 && (
        <section className="stack gap-24" style={{ marginTop: 24 }} data-testid="onboarding-results">
          <div className="card stack gap-8" style={{ padding: 24 }}>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800 }}>You're set up — here's what we found</h1>
            <p className="muted" style={{ fontSize: '0.92rem' }}>{parsedCv?.summary}</p>
          </div>

          {parsedCv && parsedCv.suggestions.length > 0 && (
            <div className="card stack gap-8" style={{ padding: 24 }}>
              <h2 style={{ fontWeight: 700 }}>CV improvement suggestions</h2>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {parsedCv.suggestions.map((s) => (
                  <li key={s} style={{ marginBottom: 6, fontSize: '0.9rem' }}>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="stack gap-16">
            <h2 style={{ fontWeight: 700 }}>
              Top {topJobs.length} trusted, deduplicated matches in {answers.targetCountryCode}
            </h2>
            <div className="stack gap-16">
              {topJobs.map(({ job, match }) => (
                <JobCard key={job.jobId} job={job} match={match} whyMatch={match?.explanation} />
              ))}
            </div>
          </div>

          {exampleDraft && exampleJob && (
            <div className="card stack gap-12" style={{ padding: 24 }}>
              <h2 style={{ fontWeight: 700 }}>
                Example tailored cover letter — {exampleJob.jobTitleNormalized} at {exampleJob.companyNameNormalized}
              </h2>
              <pre
                style={{
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '0.86rem',
                  background: 'var(--color-surface-alt)',
                  padding: 16,
                  borderRadius: 'var(--radius-md)',
                  margin: 0,
                }}
              >
                {exampleDraft.coverLetterText}
              </pre>
              <p className="muted" style={{ fontSize: '0.82rem' }}>
                This draft is saved to your application queue as "awaiting your approval" — nothing is submitted
                until you review and approve it there.
              </p>
              {exampleApp && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={async () => {
                    await getApiClient().applications.updateStatus(exampleApp.id, 'awaiting_approval');
                    router.push('/applications');
                  }}
                >
                  Review it in my application queue
                </button>
              )}
            </div>
          )}

          <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => router.push('/dashboard')}
              data-testid="onboarding-go-dashboard"
              style={{ padding: '14px 28px' }}
            >
              Go to my dashboard
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function ProgressHeader({ step }: { step: Step }) {
  const labels = ['Upload CV', '5 quick questions', 'Your matches'];
  return (
    <div className="row gap-8" aria-label={`Step ${step} of 3`}>
      {labels.map((label, i) => {
        const n = (i + 1) as Step;
        const active = n === step;
        const done = n < step;
        return (
          <div key={label} className="row gap-8" style={{ flex: 1, alignItems: 'center' }}>
            <span
              aria-hidden
              style={{
                width: 26,
                height: 26,
                borderRadius: '50%',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.78rem',
                fontWeight: 800,
                background: active || done ? 'var(--color-primary)' : 'var(--color-surface-alt)',
                color: active || done ? 'var(--color-primary-contrast)' : 'var(--color-text-muted)',
              }}
            >
              {done ? '✓' : n}
            </span>
            <span
              style={{
                fontSize: '0.85rem',
                fontWeight: active ? 700 : 500,
                color: active ? 'var(--color-text)' : 'var(--color-text-muted)',
              }}
            >
              {label}
            </span>
            {i < labels.length - 1 && (
              <div style={{ flex: 1, height: 1, background: 'var(--color-border)', marginLeft: 8 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
