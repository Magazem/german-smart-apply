'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type {
  Application,
  ApplicationDraft,
  ApplicationEvent,
  ApplicationStatus,
  CanonicalJob,
  FollowUpDraft,
} from '@german-smart-apply/shared';
import { getApiClient } from '@/lib/api-client';
import { useRequireAuth } from '@/lib/use-require-auth';
import { StatusBadge } from '@/components/status-badge';
import { ApproveApplicationModal } from '@/components/approve-application-modal';
import { formatDate, formatSalary } from '@/lib/format';

interface Row {
  application: Application;
  job: CanonicalJob | null;
  draft: ApplicationDraft | null;
}

const SECTIONS: Array<{ title: string; statuses: ApplicationStatus[]; hint?: string }> = [
  {
    title: 'Needs your review',
    statuses: ['awaiting_approval'],
    hint: 'Nothing here is sent anywhere until you explicitly approve it.',
  },
  { title: 'Drafting', statuses: ['draft_ready'] },
  { title: 'In progress', statuses: ['new', 'viewed', 'saved'] },
  { title: 'Submitted', statuses: ['applied', 'interview', 'offer'] },
  { title: 'Closed', statuses: ['rejected', 'archived'] },
];

export default function ApplicationsPage() {
  const { loading: authLoading } = useRequireAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<Row | null>(null);
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const [history, setHistory] = useState<ApplicationEvent[]>([]);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedFollowUps, setExpandedFollowUps] = useState<string | null>(null);
  const [followUps, setFollowUps] = useState<FollowUpDraft[]>([]);
  const [followUpPending, setFollowUpPending] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const api = getApiClient();
      const apps = await api.applications.list();
      const loaded = await Promise.all(
        apps.map(async (application) => {
          const [detail, draft] = await Promise.all([
            api.jobs.get(application.jobId),
            api.applications.getDraft(application.id),
          ]);
          return { application, job: detail?.job ?? null, draft };
        }),
      );
      setRows(loaded);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load your applications.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    void load();
  }, [authLoading, load]);

  const submitForApproval = async (row: Row) => {
    setRowError(null);
    try {
      await getApiClient().applications.updateStatus(row.application.id, 'awaiting_approval');
      await load();
    } catch (err) {
      setRowError({ id: row.application.id, message: err instanceof Error ? err.message : 'Could not submit.' });
    }
  };

  const markStatus = async (row: Row, status: ApplicationStatus) => {
    setRowError(null);
    try {
      await getApiClient().applications.updateStatus(row.application.id, status);
      await load();
    } catch (err) {
      setRowError({ id: row.application.id, message: err instanceof Error ? err.message : 'Could not update status.' });
    }
  };

  const toggleHistory = async (applicationId: string) => {
    if (expandedHistory === applicationId) {
      setExpandedHistory(null);
      return;
    }
    const events = await getApiClient().applications.history(applicationId);
    setHistory(events);
    setExpandedHistory(applicationId);
  };

  const toggleFollowUps = async (applicationId: string) => {
    if (expandedFollowUps === applicationId) {
      setExpandedFollowUps(null);
      return;
    }
    const drafts = await getApiClient().applications.listFollowUps(applicationId);
    setFollowUps(drafts);
    setExpandedFollowUps(applicationId);
  };

  const draftFollowUp = async (row: Row) => {
    setRowError(null);
    setFollowUpPending(row.application.id);
    try {
      await getApiClient().applications.generateFollowUp(row.application.id);
      const drafts = await getApiClient().applications.listFollowUps(row.application.id);
      setFollowUps(drafts);
      setExpandedFollowUps(row.application.id);
    } catch (err) {
      setRowError({
        id: row.application.id,
        message: err instanceof Error ? err.message : 'Could not draft a follow-up email.',
      });
    } finally {
      setFollowUpPending(null);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="container" style={{ padding: '48px 24px' }}>
        <div className="stack gap-12">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 90 }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container stack gap-32" style={{ padding: '40px 24px 96px' }}>
      <div className="stack gap-4">
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>Application queue</h1>
        <p className="muted">
          Every application moves through the same pipeline. Only you can move something from "awaiting your
          approval" to "applied" — there is no automatic or one-click shortcut.
        </p>
      </div>

      {loadError && <p className="error-text">{loadError}</p>}

      {rows.length === 0 && (
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          <p className="muted">
            No applications yet.{' '}
            <Link href="/jobs" style={{ color: 'var(--color-primary)', fontWeight: 700 }}>
              Browse jobs
            </Link>{' '}
            to get started.
          </p>
        </div>
      )}

      {SECTIONS.map((section) => {
        const sectionRows = rows.filter((r) => section.statuses.includes(r.application.status));
        if (sectionRows.length === 0) return null;
        return (
          <div key={section.title} className="stack gap-12">
            <div className="stack gap-4">
              <h2 style={{ fontWeight: 700, fontSize: '1.05rem' }}>
                {section.title} <span className="muted">({sectionRows.length})</span>
              </h2>
              {section.hint && (
                <p className="muted" style={{ fontSize: '0.82rem' }}>
                  {section.hint}
                </p>
              )}
            </div>

            <div className="stack gap-12">
              {sectionRows.map((row) => (
                <div key={row.application.id} className="card" style={{ padding: 20 }} data-testid="application-row" data-status={row.application.status}>
                  <div className="row spread" style={{ alignItems: 'flex-start' }}>
                    <div className="stack gap-4" style={{ flex: 1, minWidth: 0 }}>
                      <div className="row gap-8" style={{ alignItems: 'center' }}>
                        <Link
                          href={`/jobs/${row.application.jobId}`}
                          style={{ fontWeight: 700, textDecoration: 'none' }}
                        >
                          {row.job?.jobTitleNormalized ?? 'Job no longer available'}
                        </Link>
                        <StatusBadge status={row.application.status} />
                      </div>
                      {row.job && (
                        <span className="muted" style={{ fontSize: '0.85rem' }}>
                          {row.job.companyNameNormalized} &middot; {row.job.locationNormalized} &middot;{' '}
                          {formatSalary(row.job.salaryMin, row.job.salaryMax, row.job.salaryCurrency)}
                        </span>
                      )}
                      <span className="muted" style={{ fontSize: '0.78rem' }}>
                        Last updated {formatDate(row.application.updatedAt)}
                      </span>
                    </div>

                    <div className="row gap-8" style={{ flexShrink: 0 }}>
                      {row.application.status === 'draft_ready' && (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => submitForApproval(row)}
                          data-testid="submit-for-approval-row"
                        >
                          Submit for approval
                        </button>
                      )}

                      {row.application.status === 'awaiting_approval' && row.draft && (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => setReviewing(row)}
                          data-testid="review-approve-button"
                        >
                          Review &amp; approve
                        </button>
                      )}

                      {row.application.status === 'applied' && (
                        <>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => markStatus(row, 'interview')}>
                            Mark interview
                          </button>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => markStatus(row, 'rejected')}>
                            Mark rejected
                          </button>
                        </>
                      )}

                      {row.application.status === 'interview' && (
                        <>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => markStatus(row, 'offer')}>
                            Mark offer
                          </button>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => markStatus(row, 'rejected')}>
                            Mark rejected
                          </button>
                        </>
                      )}

                      {['applied', 'interview'].includes(row.application.status) && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => draftFollowUp(row)}
                          disabled={followUpPending === row.application.id}
                          data-testid="draft-follow-up-button"
                        >
                          {followUpPending === row.application.id ? 'Drafting…' : 'Draft follow-up email'}
                        </button>
                      )}

                      {['new', 'viewed', 'saved', 'applied', 'interview', 'offer', 'rejected'].includes(
                        row.application.status,
                      ) && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => markStatus(row, 'archived')}>
                          Archive
                        </button>
                      )}

                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggleHistory(row.application.id)}>
                        {expandedHistory === row.application.id ? 'Hide history' : 'History'}
                      </button>

                      {['applied', 'interview'].includes(row.application.status) && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => toggleFollowUps(row.application.id)}
                          data-testid="toggle-follow-ups-button"
                        >
                          {expandedFollowUps === row.application.id ? 'Hide follow-ups' : 'Follow-ups'}
                        </button>
                      )}
                    </div>
                  </div>

                  {rowError?.id === row.application.id && (
                    <p className="error-text" style={{ marginTop: 12 }}>
                      {rowError.message}
                    </p>
                  )}

                  {expandedFollowUps === row.application.id && (
                    <div
                      className="stack gap-12"
                      style={{ marginTop: 14, borderTop: '1px solid var(--color-border)', paddingTop: 12 }}
                    >
                      {followUps.length === 0 && (
                        <p className="muted" style={{ fontSize: '0.82rem' }}>
                          No follow-up drafted yet — click "Draft follow-up email" above.
                        </p>
                      )}
                      {followUps.map((followUp) => (
                        <div
                          key={followUp.id}
                          className="stack gap-4"
                          data-testid="follow-up-draft"
                          style={{ background: 'var(--color-surface-alt)', padding: 12, borderRadius: 'var(--radius-md)' }}
                        >
                          <div className="row spread" style={{ alignItems: 'center' }}>
                            <strong style={{ fontSize: '0.85rem' }}>{followUp.subject}</strong>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => navigator.clipboard.writeText(`${followUp.subject}\n\n${followUp.body}`)}
                            >
                              Copy
                            </button>
                          </div>
                          <pre
                            style={{
                              whiteSpace: 'pre-wrap',
                              fontFamily: 'var(--font-sans)',
                              fontSize: '0.82rem',
                              margin: 0,
                            }}
                          >
                            {followUp.body}
                          </pre>
                          <span className="muted" style={{ fontSize: '0.75rem' }}>
                            Drafted {formatDate(followUp.createdAt)} — review and send this yourself; we never send it
                            for you.
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {expandedHistory === row.application.id && (
                    <div className="stack gap-4" style={{ marginTop: 14, borderTop: '1px solid var(--color-border)', paddingTop: 12 }}>
                      {history.map((event) => (
                        <div key={event.id} className="row gap-8" style={{ fontSize: '0.8rem' }}>
                          <span className="muted" style={{ minWidth: 130 }}>
                            {formatDate(event.createdAt)}
                          </span>
                          <span>
                            {event.fromStatus ? `${event.fromStatus} → ${event.toStatus}` : `created as ${event.toStatus}`}
                            {event.note ? ` — ${event.note}` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {reviewing && reviewing.draft && (
        <ApproveApplicationModal
          jobTitle={reviewing.job?.jobTitleNormalized ?? 'this role'}
          companyName={reviewing.job?.companyNameNormalized ?? 'this company'}
          draft={reviewing.draft}
          onClose={() => setReviewing(null)}
          onApprove={async () => {
            await getApiClient().applications.updateStatus(
              reviewing.application.id,
              'applied',
              'Approved and submitted by you.',
            );
            setReviewing(null);
            await load();
          }}
          onRequestChanges={async () => {
            await getApiClient().applications.draft(reviewing.application.id);
            setReviewing(null);
            await load();
          }}
        />
      )}
    </div>
  );
}
