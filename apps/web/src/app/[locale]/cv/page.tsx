'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Application, ApplicationDraft, CandidateProfile, CanonicalJob, ParsedCvResult } from '@german-smart-apply/shared';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { useRequireAuth } from '@/lib/use-require-auth';

const SENIORITY_LABEL_KEYS: Record<string, string> = {
  intern: 'seniorityIntern',
  junior: 'seniorityJunior',
  mid: 'seniorityMid',
  senior: 'senioritySenior',
  lead: 'seniorityLead',
  principal: 'seniorityPrincipal',
};

export default function CvWorkspacePage() {
  const t = useTranslations('CvWorkspace');
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

  const reuploadInputRef = useRef<HTMLInputElement>(null);
  const [reparsing, setReparsing] = useState(false);
  const [reparseMessage, setReparseMessage] = useState<string | null>(null);
  const [reparseError, setReparseError] = useState<string | null>(null);

  const isPro = user?.tier === 'pro';

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    (async () => {
      try {
        const api = getApiClient();
        const [p, cv, apps] = await Promise.all([
          api.profile.get(),
          api.cv.getLastParsed(),
          api.applications.list(),
        ]);
        if (cancelled) return;
        setProfile(p);
        setParsedCv(cv);
        const withJobs = await Promise.all(
          apps.map(async (a) => ({ application: a, job: (await api.jobs.get(a.jobId))?.job ?? null })),
        );
        if (cancelled) return;
        setApplications(withJobs);
        if (withJobs[0]) setSelectedAppId(withJobs[0].application.id);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t('loadError'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading]);

  if (!authLoading && !loading && error && !profile) {
    return (
      <div className="container" style={{ padding: '48px 24px' }}>
        <p className="error-text">{error}</p>
      </div>
    );
  }

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
      setSaveMessage(t('profileSaved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveError'));
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
      setError(err instanceof Error ? err.message : t('generateError'));
    } finally {
      setGenerating(false);
    }
  };

  /**
   * The only re-entry point for refreshing contact info/experience/education/
   * languages after onboarding - CV parsing only happens once during
   * onboarding otherwise, so without this, a stale profile (e.g. one saved
   * before these fields existed, or just an outdated CV) has no way to catch
   * up short of a backend script.
   */
  const handleReupload = async () => {
    const file = reuploadInputRef.current?.files?.[0];
    if (!file) return;
    setReparsing(true);
    setReparseError(null);
    setReparseMessage(null);
    try {
      const api = getApiClient();
      const result = await api.cv.upload({ kind: 'file', file });
      const updated = await api.profile.update({
        ...(result.fullName ? { fullName: result.fullName } : {}),
        ...(result.email ? { email: result.email } : {}),
        ...(result.phone ? { phone: result.phone } : {}),
        skills: result.skills,
        summary: result.summary,
        experience: result.experience,
        education: result.education,
        languages: result.languages,
      });
      setParsedCv(result);
      setProfile(updated);
      setReparseMessage(t('reuploadCvSuccess'));
    } catch (err) {
      setReparseError(err instanceof Error ? err.message : t('reuploadCvError'));
    } finally {
      setReparsing(false);
      if (reuploadInputRef.current) reuploadInputRef.current.value = '';
    }
  };

  return (
    <div className="container stack gap-24" style={{ maxWidth: 880, padding: '40px 24px 96px' }}>
      <div className="stack gap-4">
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>{t('pageTitle')}</h1>
        <p className="muted">{t('pageDescription')}</p>
      </div>

      {parsedCv && (
        <div className="card stack gap-8" style={{ padding: 20 }}>
          <h2 style={{ fontWeight: 700, fontSize: '1.02rem' }}>{t('originalCvTitle')}</h2>
          {(parsedCv.email || parsedCv.phone) && (
            <p className="muted" style={{ fontSize: '0.82rem' }}>
              {[parsedCv.email, parsedCv.phone].filter(Boolean).join(' · ')}
            </p>
          )}
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

      <div className="card stack gap-8" style={{ padding: 20 }}>
        <h2 style={{ fontWeight: 700, fontSize: '1.02rem' }}>{t('reuploadCvTitle')}</h2>
        <p className="muted" style={{ fontSize: '0.85rem' }}>{t('reuploadCvDescription')}</p>
        <div className="field">
          <input
            ref={reuploadInputRef}
            type="file"
            accept=".pdf,.docx,.txt"
            className="input"
            onChange={handleReupload}
            disabled={reparsing}
            data-testid="cv-reupload-input"
          />
        </div>
        {reparsing && <p className="muted" style={{ fontSize: '0.85rem' }}>{t('reuploadCvButtonPending')}</p>}
        {reparseError && <p className="error-text" style={{ fontSize: '0.85rem' }}>{reparseError}</p>}
        {reparseMessage && <p className="muted" style={{ fontSize: '0.85rem' }}>{reparseMessage}</p>}
      </div>

      <div className="card stack" style={{ padding: 24 }}>
        <h2 style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 16 }}>{t('profileTitle')}</h2>

        <div className="field">
          <label htmlFor="fullName">{t('fullNameLabel')}</label>
          <input
            id="fullName"
            className="input"
            value={profile.fullName ?? ''}
            onChange={(e) => update({ fullName: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="targetRole">{t('targetRoleLabel')}</label>
          <input
            id="targetRole"
            className="input"
            value={profile.targetRole}
            onChange={(e) => update({ targetRole: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="summary">{t('summaryLabel')}</label>
          <textarea
            id="summary"
            className="textarea"
            rows={4}
            value={profile.summary ?? ''}
            onChange={(e) => update({ summary: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="skills">{t('skillsLabel')}</label>
          <input
            id="skills"
            className="input"
            value={profile.skills.join(', ')}
            onChange={(e) => update({ skills: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
          />
        </div>
        <div className="row gap-16" style={{ flexWrap: 'wrap' }}>
          <div className="field" style={{ flex: 1, minWidth: 160 }}>
            <label htmlFor="seniority">{t('seniorityLabel')}</label>
            <select
              id="seniority"
              className="select"
              value={profile.seniority}
              onChange={(e) => update({ seniority: e.target.value })}
            >
              {['intern', 'junior', 'mid', 'senior', 'lead', 'principal'].map((s) => (
                <option key={s} value={s}>
                  {t(SENIORITY_LABEL_KEYS[s])}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: 1, minWidth: 160 }}>
            <label htmlFor="locationPreference">{t('locationPreferenceLabel')}</label>
            <select
              id="locationPreference"
              className="select"
              value={profile.locationPreference}
              onChange={(e) => update({ locationPreference: e.target.value as CandidateProfile['locationPreference'] })}
            >
              <option value="onsite">{t('locationOnsite')}</option>
              <option value="hybrid">{t('locationHybrid')}</option>
              <option value="remote">{t('locationRemote')}</option>
              <option value="any">{t('locationAny')}</option>
            </select>
          </div>
        </div>

        <div className="stack gap-8" style={{ marginTop: 8, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
          <div className="row gap-8" style={{ alignItems: 'center' }}>
            <h3 style={{ fontWeight: 700, fontSize: '0.95rem' }}>{t('deeperSettingsTitle')}</h3>
            <span className="badge badge-neutral">{t('proBadge')}</span>
          </div>
          {!isPro && (
            <p className="muted" style={{ fontSize: '0.85rem' }}>
              {t('proUnlockText')} <Link href="/billing" style={{ color: 'var(--color-primary)', fontWeight: 700 }}>{t('upgradeToPro')}</Link>.
            </p>
          )}

          <div className="row gap-16" style={{ flexWrap: 'wrap', opacity: isPro ? 1 : 0.5 }}>
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label htmlFor="salaryMin">{t('salaryMinLabel')}</label>
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
              <label htmlFor="salaryMax">{t('salaryMaxLabel')}</label>
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
            <label htmlFor="workAuth">{t('workAuthorizationLabel')}</label>
            <input
              id="workAuth"
              className="input"
              disabled={!isPro}
              value={profile.workAuthorization ?? ''}
              onChange={(e) => update({ workAuthorization: e.target.value })}
            />
          </div>
          <div className="field" style={{ opacity: isPro ? 1 : 0.5 }}>
            <label htmlFor="commute">{t('commutePreferenceLabel')}</label>
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
            <label htmlFor="portfolio">{t('portfolioLinksLabel')}</label>
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
          {saving ? t('savingLabel') : t('saveProfileButton')}
        </button>
      </div>

      <div className="card stack gap-12" style={{ padding: 24 }}>
        <h2 style={{ fontWeight: 700, fontSize: '1.05rem' }}>{t('generateVariantTitle')}</h2>
        {applications.length === 0 ? (
          <p className="muted" style={{ fontSize: '0.88rem' }}>
            {t('noApplicationsPrefix')} <Link href="/jobs">{t('jobSearchLink')}</Link> {t('noApplicationsSuffix')}
          </p>
        ) : (
          <>
            <div className="field">
              <label htmlFor="jobSelect">{t('chooseTrackedJobLabel')}</label>
              <select
                id="jobSelect"
                className="select"
                value={selectedAppId}
                onChange={(e) => setSelectedAppId(e.target.value)}
              >
                {applications.map(({ application, job }) => (
                  <option key={application.id} value={application.id}>
                    {job
                      ? t('jobOptionLabel', { title: job.jobTitleNormalized, company: job.companyNameNormalized })
                      : t('unknownJobOption')}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className="btn btn-primary" onClick={handleGenerate} disabled={generating} style={{ alignSelf: 'flex-start' }}>
              {generating ? t('generatingLabel') : t('generateButton')}
            </button>

            {generatedDraft && (
              <div className="stack gap-12" style={{ marginTop: 8 }}>
                <div className="stack gap-6">
                  <strong style={{ fontSize: '0.88rem' }}>{t('cvVariantLabel')}</strong>
                  <pre style={preStyle}>{generatedDraft.cvVariantText}</pre>
                </div>
                <div className="stack gap-6">
                  <strong style={{ fontSize: '0.88rem' }}>{t('coverLetterLabel')}</strong>
                  <pre style={preStyle}>{generatedDraft.coverLetterText}</pre>
                </div>
                <p className="muted" style={{ fontSize: '0.82rem' }}>
                  {t('draftNeedsApprovalText')}{' '}
                  <Link href="/applications" style={{ color: 'var(--color-primary)', fontWeight: 700 }}>
                    {t('reviewInQueueLink')}
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
