'use client';

import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type {
  Application,
  ApplicationDraft,
  CanonicalJob,
  CvVariantStyle,
  InterviewPrepDraft,
  JobFeedbackType,
  JobMatchScore,
} from '@german-smart-apply/shared';
import { Link, useRouter } from '@/i18n/navigation';
import { getApiClient, riskLevel } from '@/lib/api-client';
import { useRequireAuth } from '@/lib/use-require-auth';
import { useAuth } from '@/lib/auth-context';
import { RiskBadge, TrustBadge } from '@/components/risk-badge';
import { MatchBreakdown, MatchScoreBar } from '@/components/match-score';
import { StatusBadge } from '@/components/status-badge';
import {
  formatEmploymentType,
  formatDate,
  formatRemoteType,
  formatSalary,
  formatSeniority,
} from '@/lib/format';

const VARIANT_STYLE_VALUES: Array<{ value: CvVariantStyle; proOnly: boolean }> = [
  { value: 'standard', proOnly: false },
  { value: 'concise', proOnly: true },
  { value: 'leadership', proOnly: true },
];

export default function JobDetailPage() {
  const { loading: authLoading } = useRequireAuth();
  const { user } = useAuth();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const t = useTranslations('JobDetail');

  const [job, setJob] = useState<CanonicalJob | null>(null);
  const [match, setMatch] = useState<JobMatchScore | null>(null);
  const [application, setApplication] = useState<Application | null>(null);
  const [draft, setDraft] = useState<ApplicationDraft | null>(null);
  const [allDrafts, setAllDrafts] = useState<ApplicationDraft[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [variantStyle, setVariantStyle] = useState<CvVariantStyle>('standard');
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [interviewPreps, setInterviewPreps] = useState<InterviewPrepDraft[]>([]);
  const [generatingPrep, setGeneratingPrep] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [myFeedback, setMyFeedback] = useState<JobFeedbackType | null>(null);
  const [feedbackPending, setFeedbackPending] = useState(false);
  const isPro = user?.tier === 'pro';

  const variantStyleLabels: Record<CvVariantStyle, string> = {
    standard: t('variantStandard'),
    concise: t('variantConcise'),
    leadership: t('variantLeadership'),
  };

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    (async () => {
      try {
        const api = getApiClient();
        const detail = await api.jobs.get(params.id);
        if (cancelled) return;
        if (!detail) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        setJob(detail.job);
        setMatch(detail.match);
        setMyFeedback(detail.myFeedback ?? null);
        // create() isn't idempotent against the real API (409s if you already
        // applied to this job, unlike the mock client's find-or-create) - fall
        // back to finding the existing application instead of erroring the
        // whole page out on a second visit.
        let app: Application;
        try {
          app = await api.applications.create(detail.job.jobId);
        } catch {
          const existing = (await api.applications.list()).find((a) => a.jobId === detail.job.jobId);
          if (!existing) throw new Error(t('applicationLoadError'));
          app = existing;
        }
        // A fresh application starts "new"; the API only allows draft
        // generation from "viewed"/"saved". Opening this page IS the user
        // viewing the job, so reflect that immediately rather than 409ing
        // the moment they click "Request draft".
        if (app.status === 'new') {
          app = await api.applications.updateStatus(app.id, 'viewed');
        }
        if (cancelled) return;
        setApplication(app);
        const [existingDraft, drafts, preps] = await Promise.all([
          api.applications.getDraft(app.id),
          api.applications.listDrafts(app.id),
          api.applications.listInterviewPreps(app.id),
        ]);
        if (cancelled) return;
        setDraft(existingDraft);
        setAllDrafts(drafts);
        setSelectedDraftId(existingDraft?.id ?? null);
        setInterviewPreps(preps);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : t('loadJobError'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, params.id]);

  const refreshApplication = async () => {
    if (!application) return;
    const updated = await getApiClient().applications.get(application.id);
    setApplication(updated);
  };

  const handleSave = async () => {
    if (!application) return;
    setActionError(null);
    try {
      await getApiClient().applications.updateStatus(application.id, 'saved');
      await refreshApplication();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('saveJobError'));
    }
  };

  const handleRequestDraft = async () => {
    if (!application) return;
    setDrafting(true);
    setActionError(null);
    try {
      const api = getApiClient();
      const newDraft = await api.applications.draft(application.id, variantStyle);
      setDraft(newDraft);
      setSelectedDraftId(newDraft.id);
      const drafts = await api.applications.listDrafts(application.id);
      setAllDrafts(drafts);
      await refreshApplication();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('draftGenError'));
    } finally {
      setDrafting(false);
    }
  };

  const selectedDraft = allDrafts.find((d) => d.id === selectedDraftId) ?? draft;

  const handleDownloadPdf = async () => {
    if (!application || !selectedDraft) return;
    setDownloadingPdf(true);
    setActionError(null);
    try {
      const blob = await getApiClient().applications.downloadPdf(application.id, selectedDraft.id);
      // The mock client returns a text/plain stand-in (see mock-client.ts) -
      // name the download by its actual type so it opens cleanly either way.
      const extension = blob.type === 'application/pdf' ? 'pdf' : 'txt';
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `application-${job?.companyNameNormalized ?? 'packet'}.${extension}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('pdfDownloadError'));
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleGenerateInterviewPrep = async () => {
    if (!application) return;
    setGeneratingPrep(true);
    setActionError(null);
    try {
      const prep = await getApiClient().applications.generateInterviewPrep(application.id);
      setInterviewPreps((prev) => [prep, ...prev]);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('interviewPrepError'));
    } finally {
      setGeneratingPrep(false);
    }
  };

  const handleFeedback = async (feedback: JobFeedbackType) => {
    if (!job || feedbackPending) return;
    setFeedbackPending(true);
    setActionError(null);
    try {
      const res = await getApiClient().jobs.recordFeedback(job.jobId, feedback);
      setMyFeedback(res.feedback);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('feedbackError'));
    } finally {
      setFeedbackPending(false);
    }
  };

  const handleSubmitForApproval = async () => {
    if (!application) return;
    setActionError(null);
    try {
      // The preview above can show any variant the user tabbed to, not just
      // the most recent one - record which one was on screen at submit time
      // so the approval queue/history shows what was actually reviewed,
      // instead of silently implying "the latest draft" regardless of what
      // was selected.
      const submittedLabel = selectedDraft?.variantLabel ?? 'standard';
      await getApiClient().applications.updateStatus(
        application.id,
        'awaiting_approval',
        `Submitted the "${submittedLabel}" draft for approval.`,
      );
      router.push('/applications');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('approvalError'));
    }
  };

  if (authLoading || loading) {
    return (
      <div className="container" style={{ padding: '48px 24px' }}>
        <div className="skeleton" style={{ height: 260 }} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="container" style={{ padding: '48px 24px' }}>
        <p className="error-text">{loadError}</p>
        <Link href="/jobs">{t('backToSearch')}</Link>
      </div>
    );
  }

  if (notFound || !job) {
    return (
      <div className="container" style={{ padding: '48px 24px' }}>
        <p>
          {t('jobNotFound')} <Link href="/jobs">{t('backToSearch')}</Link>
        </p>
      </div>
    );
  }

  const risk = riskLevel(job.scamRiskScore);

  return (
    <div className="container" style={{ maxWidth: 880, padding: '40px 24px 96px' }}>
      <Link href="/jobs" className="muted" style={{ fontSize: '0.85rem', textDecoration: 'none' }}>
        &larr; {t('backToSearch')}
      </Link>

      {risk === 'high' && (
        <div
          className="card"
          role="alert"
          style={{
            marginTop: 16,
            padding: 16,
            background: 'var(--color-danger-bg)',
            border: '1px solid var(--color-danger)',
          }}
        >
          <strong style={{ color: 'var(--color-danger)' }}>{t('highRiskTitle')}</strong> {t('highRiskBody')}
        </div>
      )}

      <div className="card stack gap-16" style={{ padding: 28, marginTop: 16 }}>
        <div className="row spread" style={{ alignItems: 'flex-start' }}>
          <div className="stack gap-4">
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>{job.jobTitleNormalized}</h1>
            <p className="muted">
              {job.companyNameNormalized} &middot; {job.locationNormalized} &middot; {formatRemoteType(job.remoteType)}
            </p>
          </div>
          {match && <MatchScoreBar match={match} />}
        </div>

        <div className="row row-wrap gap-8">
          <span className="tag">{formatSeniority(job.seniority)}</span>
          <span className="tag">{formatEmploymentType(job.employmentType)}</span>
          <span className="tag">{formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency)}</span>
          <span className="tag">{t('postedLabel', { date: formatDate(job.postedAt) })}</span>
          <span className="tag">{t('sourceLabel', { source: job.sourceType })}</span>
        </div>

        <div className="row row-wrap gap-8">
          <RiskBadge scamRiskScore={job.scamRiskScore} />
          <TrustBadge sourceTrustScore={job.sourceTrustScore} />
        </div>

        <div className="row row-wrap gap-8">
          <a
            href={job.applyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary btn-sm"
            data-testid="apply-original-link"
          >
            {t('applyOn', { source: job.sourceType })}
          </a>
          {job.sourceUrl !== job.applyUrl && (
            <a
              href={job.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary btn-sm"
              data-testid="view-original-listing-link"
            >
              {t('viewOriginalListing')}
            </a>
          )}
        </div>

        <div className="row gap-8" style={{ alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: '0.85rem' }}>
            {t('notEnoughRoles')}
          </span>
          <button
            type="button"
            className={myFeedback === 'like' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            onClick={() => handleFeedback('like')}
            disabled={feedbackPending}
            aria-pressed={myFeedback === 'like'}
            data-testid="feedback-like-button"
            title={t('moreLikeThis')}
          >
            👍
          </button>
          <button
            type="button"
            className={myFeedback === 'skip' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            onClick={() => handleFeedback('skip')}
            disabled={feedbackPending}
            aria-pressed={myFeedback === 'skip'}
            data-testid="feedback-skip-button"
            title={t('fewerLikeThis')}
          >
            👎
          </button>
        </div>

        {application && (
          <div className="row gap-8" style={{ alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              {t('statusLabel')}
            </span>
            <StatusBadge status={application.status} />
          </div>
        )}

        {match?.explanation && (
          <div className="card" style={{ padding: 16, background: 'var(--color-info-bg)', border: 'none' }}>
            <strong style={{ fontSize: '0.9rem' }}>{t('whyMatches')} </strong>
            <span style={{ fontSize: '0.9rem' }}>{match.explanation}</span>
          </div>
        )}

        {match && (
          <details>
            <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem' }}>{t('matchBreakdownSummary')}</summary>
            <div style={{ marginTop: 12 }}>
              <MatchBreakdown match={match} />
            </div>
          </details>
        )}

        <div className="stack gap-8">
          <h2 style={{ fontWeight: 700, fontSize: '1.05rem' }}>{t('fullDescriptionHeading')}</h2>
          <p style={{ fontSize: '0.92rem', whiteSpace: 'pre-wrap' }}>{job.jobDescriptionText}</p>
        </div>

        <div className="row row-wrap gap-8">
          {job.techStackTags.map((tag) => (
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
        </div>

        {actionError && <p className="error-text">{actionError}</p>}

        {application && ['viewed', 'saved', 'draft_ready'].includes(application.status) && (
          <div className="stack gap-8">
            <span className="muted" style={{ fontSize: '0.82rem' }}>{t('cvVariantStyleLabel')}</span>
            <div className="row row-wrap gap-8">
              {VARIANT_STYLE_VALUES.map((opt) => {
                const locked = opt.proOnly && !isPro;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={variantStyle === opt.value ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                    onClick={() => setVariantStyle(opt.value)}
                    disabled={locked}
                    title={locked ? t('proRequiredTitle') : undefined}
                    data-testid={`variant-style-${opt.value}`}
                  >
                    {variantStyleLabels[opt.value]}
                    {opt.proOnly && t('proSuffix')}
                  </button>
                );
              })}
            </div>
            {VARIANT_STYLE_VALUES.some((o) => o.proOnly && !isPro) && (
              <p className="muted" style={{ fontSize: '0.78rem' }}>
                {t('proVariantsNotePrefix')}{' '}
                <Link href="/billing" style={{ color: 'var(--color-primary)' }}>
                  {t('proLinkLabel')}
                </Link>
                {t('proVariantsNoteSuffix')}
              </p>
            )}
          </div>
        )}

        <div className="row row-wrap gap-8" style={{ borderTop: '1px solid var(--color-border)', paddingTop: 16 }}>
          {application?.status !== 'saved' &&
            application?.status !== 'draft_ready' &&
            application?.status !== 'awaiting_approval' &&
            !['applied', 'interview', 'rejected', 'offer', 'archived'].includes(application?.status ?? '') && (
              <button type="button" className="btn btn-secondary" onClick={handleSave} data-testid="save-job-button">
                {t('saveForLater')}
              </button>
            )}

          {application &&
            ['viewed', 'saved', 'draft_ready'].includes(application.status) && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleRequestDraft}
                disabled={drafting}
                data-testid="request-draft-button"
              >
                {drafting ? t('generatingDraft') : draft ? t('regenerateDraft') : t('requestDraft')}
              </button>
            )}

          {application?.status === 'draft_ready' && draft && (
            <button type="button" className="btn btn-primary" onClick={handleSubmitForApproval} data-testid="submit-for-approval-button">
              {allDrafts.length > 1
                ? t('submitDraftNamed', { label: selectedDraft?.variantLabel ?? 'standard' })
                : t('submitForApproval')}
            </button>
          )}

          {application?.status === 'awaiting_approval' && (
            <Link href="/applications" className="btn btn-primary">
              {t('reviewApproveQueue')}
            </Link>
          )}

          {['applied', 'interview', 'rejected', 'offer'].includes(application?.status ?? '') && (
            <Link href="/applications" className="btn btn-secondary">
              {t('viewInQueue')}
            </Link>
          )}
        </div>

        {application && (
          <div className="card stack gap-12" style={{ padding: 20, background: 'var(--color-surface-alt)' }}>
            <div className="row spread" style={{ alignItems: 'center' }}>
              <h3 style={{ fontWeight: 700, fontSize: '0.95rem' }}>{t('interviewPrepHeading')}</h3>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleGenerateInterviewPrep}
                disabled={generatingPrep}
                data-testid="generate-interview-prep-button"
              >
                {generatingPrep ? t('generatingPrep') : interviewPreps.length > 0 ? t('regeneratePrep') : t('generatePrep')}
              </button>
            </div>
            <p className="muted" style={{ fontSize: '0.82rem' }}>
              {t('interviewPrepHint')}
            </p>

            {interviewPreps[0] && (
              <div className="stack gap-12" data-testid="interview-prep-content">
                <div className="stack gap-8">
                  <strong style={{ fontSize: '0.85rem' }}>{t('likelyQuestions')}</strong>
                  <ul style={{ margin: 0, paddingLeft: 20, fontSize: '0.85rem' }}>
                    {interviewPreps[0].questions.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </div>
                <div className="stack gap-8">
                  <strong style={{ fontSize: '0.85rem' }}>{t('talkingPoints')}</strong>
                  <ul style={{ margin: 0, paddingLeft: 20, fontSize: '0.85rem' }}>
                    {interviewPreps[0].talkingPoints.map((tp, i) => (
                      <li key={i}>{tp}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}

        {selectedDraft && (
          <div className="card stack gap-12" style={{ padding: 20, background: 'var(--color-surface-alt)' }}>
            <div className="row spread" style={{ alignItems: 'center' }}>
              <h3 style={{ fontWeight: 700, fontSize: '0.95rem' }}>{t('draftPreviewHeading')}</h3>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                data-testid="download-pdf-button"
              >
                {downloadingPdf ? t('preparingPdf') : t('downloadPdf')}
              </button>
            </div>
            <p className="muted" style={{ fontSize: '0.82rem' }}>
              {t('reviewCarefullyNote')}
            </p>

            {allDrafts.length > 1 && (
              <div className="row row-wrap gap-8">
                {allDrafts.map((d, i) => (
                  <button
                    key={d.id}
                    type="button"
                    className={d.id === selectedDraft.id ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
                    onClick={() => setSelectedDraftId(d.id)}
                    data-testid={`draft-variant-tab-${i}`}
                  >
                    {d.variantLabel} · {formatDate(d.createdAt)}
                  </button>
                ))}
              </div>
            )}

            <div className="stack gap-8">
              <strong style={{ fontSize: '0.85rem' }}>{t('cvVariantHeading')}</strong>
              <pre
                style={{
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '0.85rem',
                  background: 'var(--color-surface)',
                  padding: 14,
                  borderRadius: 'var(--radius-md)',
                  margin: 0,
                }}
              >
                {selectedDraft.cvVariantText}
              </pre>
            </div>

            <div className="stack gap-8">
              <strong style={{ fontSize: '0.85rem' }}>{t('coverLetterHeading')}</strong>
              <pre
                style={{
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '0.85rem',
                  background: 'var(--color-surface)',
                  padding: 14,
                  borderRadius: 'var(--radius-md)',
                  margin: 0,
                }}
              >
                {selectedDraft.coverLetterText}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
