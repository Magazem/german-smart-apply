'use client';

import { useEffect, useState } from 'react';
import { useRequireAuth } from '@/lib/use-require-auth';
import { getApiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import type { AlertRunSummary, DedupStats, SourceCrawlRun, SourceHealth } from '@/lib/api/types';

function successRateBadge(rate: number | null): { className: string; label: string } {
  if (rate === null) return { className: 'badge badge-neutral', label: 'No runs yet' };
  const pct = Math.round(rate * 100);
  if (pct >= 90) return { className: 'badge badge-success', label: `${pct}% success` };
  if (pct >= 50) return { className: 'badge badge-warning', label: `${pct}% success` };
  return { className: 'badge badge-danger', label: `${pct}% success` };
}

function runStatusBadge(status: SourceCrawlRun['status']): { className: string; label: string } {
  switch (status) {
    case 'success':
      return { className: 'badge badge-success', label: 'Success' };
    case 'partial_failure':
      return { className: 'badge badge-warning', label: 'Partial failure' };
    case 'failure':
      return { className: 'badge badge-danger', label: 'Failure' };
    case 'running':
      return { className: 'badge badge-neutral', label: 'Running' };
  }
}

export default function AdminPage() {
  const { loading: authLoading } = useRequireAuth();
  const [sources, setSources] = useState<SourceHealth[] | null>(null);
  const [dedupStats, setDedupStats] = useState<DedupStats | null>(null);
  const [runsBySource, setRunsBySource] = useState<Record<string, SourceCrawlRun[]>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [alertRun, setAlertRun] = useState<AlertRunSummary | null>(null);
  const [runningAlerts, setRunningAlerts] = useState(false);
  const [alertRunError, setAlertRunError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    const api = getApiClient();
    const handleError = (err: unknown) => {
      if (cancelled) return;
      setError(
        err instanceof Error && err.message.includes('admin')
          ? 'You don’t have access to this page — it requires an admin account.'
          : 'Could not load admin data.',
      );
    };
    void api.admin.listSources().then((result) => {
      if (!cancelled) setSources(result);
    }, handleError);
    void api.admin.dedupStats().then((result) => {
      if (!cancelled) setDedupStats(result);
    }, handleError);
    return () => {
      cancelled = true;
    };
  }, [authLoading]);

  const handleRunAlerts = async () => {
    setRunningAlerts(true);
    setAlertRunError(null);
    try {
      const result = await getApiClient().admin.runAlerts();
      setAlertRun(result);
    } catch (err) {
      setAlertRunError(err instanceof Error ? err.message : 'Could not run alerts.');
    } finally {
      setRunningAlerts(false);
    }
  };

  const toggleExpanded = async (sourceId: string) => {
    if (expandedId === sourceId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(sourceId);
    if (!runsBySource[sourceId]) {
      const result = await getApiClient().admin.sourceRuns(sourceId);
      if (result) {
        setRunsBySource((prev) => ({ ...prev, [sourceId]: result.runs }));
      }
    }
  };

  if (authLoading) {
    return (
      <div className="container" style={{ padding: '48px 24px' }}>
        <p className="muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="container stack gap-24" style={{ padding: '40px 24px 96px' }}>
      <div className="stack gap-4">
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>Admin — source health</h1>
        <p className="muted">
          Crawl run history and success rate per job source, over each source’s last 20 runs.
        </p>
      </div>

      {error && (
        <div className="card" style={{ padding: 16, background: 'var(--color-danger-bg)', border: 'none' }}>
          <p style={{ fontSize: '0.88rem' }}>{error}</p>
        </div>
      )}

      {!error && dedupStats && (
        <div className="card stack gap-12" style={{ padding: 20 }} data-testid="admin-dedup-stats">
          <h2 style={{ fontWeight: 700, fontSize: '1.05rem' }}>Deduplication</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
            <div className="stack gap-4">
              <span className="muted" style={{ fontSize: '0.78rem' }}>Raw jobs crawled</span>
              <strong style={{ fontSize: '1.3rem' }}>{dedupStats.totalRawJobs.toLocaleString()}</strong>
            </div>
            <div className="stack gap-4">
              <span className="muted" style={{ fontSize: '0.78rem' }}>Visible canonical jobs</span>
              <strong style={{ fontSize: '1.3rem' }}>{dedupStats.visibleCanonicalJobs.toLocaleString()}</strong>
            </div>
            <div className="stack gap-4">
              <span className="muted" style={{ fontSize: '0.78rem' }}>Hidden by duplication</span>
              <strong style={{ fontSize: '1.3rem' }}>{dedupStats.hiddenByDuplication.toLocaleString()}</strong>
            </div>
            <div className="stack gap-4">
              <span className="muted" style={{ fontSize: '0.78rem' }}>Duplicate clusters</span>
              <strong style={{ fontSize: '1.3rem' }}>{dedupStats.totalDuplicateClusters.toLocaleString()}</strong>
              <span className="muted" style={{ fontSize: '0.75rem' }}>
                {dedupStats.exactDuplicateClusters} exact · {dedupStats.nearDuplicateClusters} near-dup
              </span>
            </div>
          </div>
        </div>
      )}

      {!error && (
        <div className="card stack gap-12" style={{ padding: 20 }} data-testid="admin-alerts-card">
          <div className="row spread" style={{ flexWrap: 'wrap', gap: 12 }}>
            <div className="stack gap-4">
              <h2 style={{ fontWeight: 700, fontSize: '1.05rem' }}>Saved search alerts</h2>
              <p className="muted" style={{ fontSize: '0.8rem' }}>
                Manually-invokable only — checks every active saved search for new matches and emails owners.
                No standing scheduler runs this automatically yet.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleRunAlerts}
              disabled={runningAlerts}
              data-testid="admin-run-alerts"
            >
              {runningAlerts ? 'Running…' : 'Run alerts now'}
            </button>
          </div>
          {alertRunError && (
            <p style={{ fontSize: '0.82rem', color: 'var(--color-danger)' }}>{alertRunError}</p>
          )}
          {alertRun && (
            <p style={{ fontSize: '0.85rem' }} data-testid="admin-alerts-result">
              Checked {alertRun.searchesChecked} active saved search{alertRun.searchesChecked === 1 ? '' : 'es'} ·
              sent {alertRun.emailsSent} email{alertRun.emailsSent === 1 ? '' : 's'} ·
              {' '}{alertRun.totalJobsMatched} new job{alertRun.totalJobsMatched === 1 ? '' : 's'} matched
            </p>
          )}
        </div>
      )}

      {!error && !sources && <p className="muted">Loading source health…</p>}

      {!error && sources && sources.length === 0 && (
        <p className="muted">No sources configured yet.</p>
      )}

      {!error && sources && sources.length > 0 && (
        <div className="stack gap-12">
          {sources.map((source) => {
            const rate = successRateBadge(source.successRate);
            const runs = runsBySource[source.id];
            const expanded = expandedId === source.id;
            return (
              <div key={source.id} className="card stack gap-12" style={{ padding: 20 }} data-testid={`admin-source-${source.sourceType}`}>
                <div className="row spread" style={{ flexWrap: 'wrap', gap: 12 }}>
                  <div className="stack gap-4">
                    <div className="row gap-8" style={{ alignItems: 'baseline' }}>
                      <strong style={{ fontSize: '1rem' }}>{source.displayName}</strong>
                      <span className="muted" style={{ fontSize: '0.8rem' }}>{source.sourceType}</span>
                    </div>
                    <div className="row gap-8" style={{ fontSize: '0.78rem' }}>
                      <span className="badge badge-neutral" style={{ textTransform: 'uppercase' }}>
                        {source.trustTier} trust
                      </span>
                      <span className={source.isActive ? 'badge badge-success' : 'badge badge-neutral'}>
                        {source.isActive ? 'Active' : 'Paused'}
                      </span>
                      <span className="muted">every {source.crawlFrequencyMinutes} min</span>
                    </div>
                  </div>

                  <div className="row gap-12" style={{ alignItems: 'center' }}>
                    <span className={rate.className}>{rate.label}</span>
                    {source.lastRun ? (
                      <div className="stack gap-4" style={{ textAlign: 'right' }}>
                        <span className={runStatusBadge(source.lastRun.status).className}>
                          {runStatusBadge(source.lastRun.status).label}
                        </span>
                        <span className="muted" style={{ fontSize: '0.75rem' }}>
                          {formatDate(source.lastRun.startedAt)}
                        </span>
                      </div>
                    ) : (
                      <span className="muted" style={{ fontSize: '0.8rem' }}>Never run</span>
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => toggleExpanded(source.id)}
                      data-testid={`admin-source-toggle-${source.sourceType}`}
                    >
                      {expanded ? 'Hide history' : 'View history'}
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="stack gap-8" style={{ borderTop: '1px solid var(--color-border)', paddingTop: 12 }}>
                    {!runs && <p className="muted" style={{ fontSize: '0.85rem' }}>Loading runs…</p>}
                    {runs && runs.length === 0 && (
                      <p className="muted" style={{ fontSize: '0.85rem' }}>No crawl runs recorded yet.</p>
                    )}
                    {runs?.map((run) => {
                      const badge = runStatusBadge(run.status);
                      return (
                        <div
                          key={run.id}
                          className="row spread"
                          style={{ fontSize: '0.82rem', flexWrap: 'wrap', gap: 8, padding: '6px 0' }}
                        >
                          <div className="row gap-8" style={{ alignItems: 'center' }}>
                            <span className={badge.className}>{badge.label}</span>
                            <span className="muted">{formatDate(run.startedAt)}</span>
                          </div>
                          <div className="row gap-12" style={{ color: 'var(--color-text-muted)' }}>
                            <span>{run.jobsFetched} fetched</span>
                            <span>{run.jobsNew} new</span>
                            <span>{run.jobsUpdated} updated</span>
                            {run.retryCount > 0 && <span>{run.retryCount} retries</span>}
                          </div>
                          {run.errorLog && (
                            <p style={{ width: '100%', margin: 0, fontSize: '0.78rem', color: 'var(--color-danger)' }}>
                              {run.errorLog}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
