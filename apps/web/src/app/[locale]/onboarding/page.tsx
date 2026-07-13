'use client';

import { useTranslations } from 'next-intl';
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
import { useRouter } from '@/i18n/navigation';
import { getApiClient } from '@/lib/api-client';
import { useRequireAuth } from '@/lib/use-require-auth';
import { JobCard } from '@/components/job-card';

type Step = 1 | 2 | 3;

const SENIORITY_OPTIONS: Seniority[] = ['intern', 'junior', 'mid', 'senior', 'lead', 'principal'];

interface Answers {
  fullName: string;
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
  const t = useTranslations('Onboarding');

  const [step, setStep] = useState<Step>(1);
  const [cvMode, setCvMode] = useState<'file' | 'text'>('file');
  const [cvText, setCvText] = useState('');
  const [parsedCv, setParsedCv] = useState<ParsedCvResult | null>(null);
  const [parsing, setParsing] = useState(false);
  const [cvError, setCvError] = useState<string | null>(null);

  const [answers, setAnswers] = useState<Answers>({
    fullName: '',
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
        <p className="muted">{t('loading')}</p>
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
          setCvError(t('chooseFileError'));
          setParsing(false);
          return;
        }
        result = await api.cv.upload({ kind: 'file', file });
      } else {
        if (!cvText.trim()) {
          setCvError(t('pasteTextError'));
          setParsing(false);
          return;
        }
        result = await api.cv.upload({ kind: 'text', text: cvText });
      }
      setParsedCv(result);
      if (result.fullName) {
        setAnswers((a) => (a.fullName ? a : { ...a, fullName: result.fullName! }));
      }
      await api.profile.update({
        ...(result.fullName ? { fullName: result.fullName } : {}),
        ...(result.email ? { email: result.email } : {}),
        ...(result.phone ? { phone: result.phone } : {}),
        skills: result.skills,
        summary: result.summary,
        experience: result.experience,
        education: result.education,
        languages: result.languages,
      });
    } catch (err) {
      setCvError(err instanceof Error ? err.message : t('parseGenericError'));
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
        fullName: answers.fullName,
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
        let app = await api.applications.create(jobs[0].job.jobId);
        // A fresh application starts "new" against the real API; draft
        // generation requires "viewed"/"saved" first. The mock client
        // fast-forwards create() straight to "viewed" internally (and
        // rejects a same-status update, matching the real API's transition
        // table), so this guard is required on both backends: unconditional
        // would 409/throw against whichever one didn't already auto-view it.
        if (app.status === 'new') {
          app = await api.applications.updateStatus(app.id, 'viewed');
        }
        const draft = await api.applications.draft(app.id);
        setExampleApp(app);
        setExampleJob(jobs[0].job);
        setExampleDraft(draft);
      }

      setStep(3);
    } catch (err) {
      setAnswersError(err instanceof Error ? err.message : t('answersGenericError'));
    } finally {
      setSubmittingAnswers(false);
    }
  };

  const seniorityLabels: Record<Seniority, string> = {
    intern: t('seniorityIntern'),
    junior: t('seniorityJunior'),
    mid: t('seniorityMid'),
    senior: t('senioritySenior'),
    lead: t('seniorityLead'),
    principal: t('seniorityPrincipal'),
  };

  return (
    <div className="container" style={{ maxWidth: 760, padding: '48px 24px 96px' }}>
      <ProgressHeader step={step} />

      {step === 1 && (
        <section className="card stack gap-16" style={{ padding: 32, marginTop: 24 }}>
          <div className="stack gap-4">
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800 }}>{t('step1Heading')}</h1>
            <p className="muted" style={{ fontSize: '0.9rem' }}>
              {t('step1Subtitle')}
            </p>
          </div>

          <div className="row gap-8">
            <button
              type="button"
              className={`btn btn-sm ${cvMode === 'file' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setCvMode('file')}
            >
              {t('uploadFileToggle')}
            </button>
            <button
              type="button"
              className={`btn btn-sm ${cvMode === 'text' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setCvMode('text')}
            >
              {t('pasteTextToggle')}
            </button>
          </div>

          {cvMode === 'file' ? (
            <div className="field">
              <label htmlFor="cv-file">{t('cvFileLabel')}</label>
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
              <label htmlFor="cv-text">{t('cvTextLabel')}</label>
              <textarea
                id="cv-text"
                className="textarea"
                rows={8}
                value={cvText}
                onChange={(e) => setCvText(e.target.value)}
                data-testid="cv-text-input"
                placeholder={t('cvTextPlaceholder')}
              />
            </div>
          )}

          {cvError && <p className="error-text">{cvError}</p>}

          {parsedCv && (
            <div className="card stack gap-8" style={{ padding: 16, background: 'var(--color-surface-alt)' }}>
              <strong>{t('parsedPrefix', { name: parsedCv.fullName ?? t('parsedFallbackName') })}</strong>
              {(parsedCv.email || parsedCv.phone) && (
                <p className="muted" style={{ fontSize: '0.82rem' }}>
                  {[parsedCv.email, parsedCv.phone].filter(Boolean).join(' · ')}
                </p>
              )}
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
                  {parsing ? t('parseCvButtonPending') : t('parseCvButtonIdle')}
                </button>
              )}
              {parsedCv && (
                <button type="button" className="btn btn-primary" onClick={() => setStep(2)} data-testid="onboarding-continue-step2">
                  {t('continueButton')}
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="card stack gap-16" style={{ padding: 32, marginTop: 24 }}>
          <div className="stack gap-4">
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800 }}>{t('step2Heading')}</h1>
            <p className="muted" style={{ fontSize: '0.9rem' }}>
              {t('step2Subtitle')}
            </p>
          </div>

          <form onSubmit={handleAnswers} className="stack">
            <div className="field">
              <label htmlFor="fullName">{t('fullNameQuestion')}</label>
              <input
                id="fullName"
                required
                className="input"
                value={answers.fullName}
                onChange={(e) => setAnswers((a) => ({ ...a, fullName: e.target.value }))}
                placeholder={t('fullNamePlaceholder')}
                autoComplete="name"
                data-testid="onboarding-full-name"
              />
              <span className="field-hint">{t('fullNameHint')}</span>
            </div>
            <div className="field">
              <label htmlFor="targetRole">{t('targetRoleQuestion')}</label>
              <input
                id="targetRole"
                required
                className="input"
                value={answers.targetRole}
                onChange={(e) => setAnswers((a) => ({ ...a, targetRole: e.target.value }))}
                placeholder={t('targetRolePlaceholder')}
                data-testid="onboarding-target-role"
              />
            </div>
            <div className="field">
              <label htmlFor="targetCountryCode">{t('countryQuestion')}</label>
              <select
                id="targetCountryCode"
                className="select"
                value={answers.targetCountryCode}
                onChange={(e) => setAnswers((a) => ({ ...a, targetCountryCode: e.target.value }))}
                data-testid="onboarding-country"
              >
                <option value="DE">{t('countryGermany')}</option>
                <option value="FR" disabled>
                  {t('countryFranceSoon')}
                </option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="preferredLanguage">{t('languageQuestion')}</label>
              <select
                id="preferredLanguage"
                className="select"
                value={answers.preferredLanguage}
                onChange={(e) => setAnswers((a) => ({ ...a, preferredLanguage: e.target.value }))}
                data-testid="onboarding-language"
              >
                <option value="en">{t('languageEnglish')}</option>
                <option value="de">{t('languageGerman')}</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="seniority">{t('seniorityQuestion')}</label>
              <select
                id="seniority"
                className="select"
                value={answers.seniority}
                onChange={(e) => setAnswers((a) => ({ ...a, seniority: e.target.value as Seniority }))}
                data-testid="onboarding-seniority"
              >
                {SENIORITY_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {seniorityLabels[s]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="locationPreference">{t('locationQuestion')}</label>
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
                <option value="onsite">{t('locationOnsite')}</option>
                <option value="hybrid">{t('locationHybrid')}</option>
                <option value="remote">{t('locationRemote')}</option>
                <option value="any">{t('locationAny')}</option>
              </select>
            </div>

            {answersError && <p className="error-text">{answersError}</p>}

            <div className="row spread">
              <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>
                {t('backButton')}
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submittingAnswers}
                data-testid="onboarding-see-matches"
              >
                {submittingAnswers ? t('seeMatchesPending') : t('seeMatchesIdle')}
              </button>
            </div>
          </form>
        </section>
      )}

      {step === 3 && (
        <section className="stack gap-24" style={{ marginTop: 24 }} data-testid="onboarding-results">
          <div className="card stack gap-8" style={{ padding: 24 }}>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800 }}>{t('step3Heading')}</h1>
            <p className="muted" style={{ fontSize: '0.92rem' }}>{parsedCv?.summary}</p>
          </div>

          {parsedCv && parsedCv.suggestions.length > 0 && (
            <div className="card stack gap-8" style={{ padding: 24 }}>
              <h2 style={{ fontWeight: 700 }}>{t('suggestionsHeading')}</h2>
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
              {t('topMatchesHeading', { count: topJobs.length, country: answers.targetCountryCode })}
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
                {t('exampleCoverLetterHeading', {
                  jobTitle: exampleJob.jobTitleNormalized,
                  companyName: exampleJob.companyNameNormalized,
                })}
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
                {t('exampleCoverLetterNote')}
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
                  {t('reviewQueueButton')}
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
              {t('goDashboardButton')}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function ProgressHeader({ step }: { step: Step }) {
  const t = useTranslations('Onboarding');
  const labels = [t('progressStep1'), t('progressStep2'), t('progressStep3')];
  return (
    <div className="row gap-8" aria-label={t('progressAriaLabel', { step })}>
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
