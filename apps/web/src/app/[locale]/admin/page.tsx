'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useRequireAuth } from '@/lib/use-require-auth';
import { getApiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import type { AlertRunSummary, AnalyticsSummary, DedupStats, SourceCrawlRun, SourceHealth } from '@/lib/api/types';

const FUNNEL_LABEL_KEYS: Record<string, string> = {
  new: 'funnelNew',
  viewed: 'funnelViewed',
  saved: 'funnelSaved',
  draft_ready: 'funnelDraftReady',
  awaiting_approval: 'funnelAwaitingApproval',
  applied: 'funnelApplied',
  interview: 'funnelInterview',
  offer: 'funnelOffer',
  rejected: 'funnelRejected',
  archived: 'funnelArchived',
};

type T = ReturnType<typeof useTranslations>;

function successRateBadge(rate: number | null, t: T): { className: string; label: string } {
  if (rate === null) return { className: 'badge badge-neutral', label: t('noRunsYet') };
  const pct = Math.round(rate * 100);
  const label = t('successRate', { pct });
  if (pct >= 90) return { className: 'badge badge-success', label };
  if (pct >= 50) return { className: 'badge badge-warning', label };
  return { className: 'badge badge-danger', label };
}

function runStatusBadge(status: SourceCrawlRun['status'], t: T): { className: string; label: string } {
  switch (status) {
    case 'success':
      return { className: 'badge badge-success', label: t('runSuccess') };
    case 'partial_failure':
      return { className: 'badge badge-warning', label: t('runPartialFailure') };
    case 'failure':
      return { className: 'badge badge-danger', label: t('runFailure') };
    case 'running':
      return { className: 'badge badge-neutral', label: t('runRunning') };
  }
}

export default function AdminPage() {
  const t = useTranslations('Admin');
  const { loading: authLoading } = useRequireAuth();
  const [sources, setSources] = useState<SourceHealth[] | null>(null);
  const [dedupStats, setDedupStats] = useState<DedupStats | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [runsBySource, setRunsBySource] = useState<Record<string, SourceCrawlRun[]>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [alertRun, setAlertRun] = useState<AlertRunSummary | null>(null);
  const [runningAlerts, setRunningAlerts] = useState(false);
  const [alertRunError, setAlertRunError] = useState<string | null>(null);

  const [openRouterModel, setOpenRouterModel] = useState<string | null>(null);
  const [modelInput, setModelInput] = useState('');
  const [savingModel, setSavingModel] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [modelMessage, setModelMessage] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    const api = getApiClient();
    const handleError = (err: unknown) => {
      if (cancelled) return;
      setError(
        err instanceof Error && err.message.includes('admin') ? t('noAccessError') : t('loadError'),
      );
    };
    void api.admin.listSources().then((result) => {
      if (!cancelled) setSources(result);
    }, handleError);
    void api.admin.dedupStats().then((result) => {
      if (!cancelled) setDedupStats(result);
    }, handleError);
    void api.admin.analytics().then((result) => {
      if (!cancelled) setAnalytics(result);
    }, handleError);
    void api.admin.getOpenRouterModel().then((result) => {
      if (!cancelled) {
        setOpenRouterModel(result.model);
        setModelInput(result.model ?? '');
      }
    }, handleError);
    return () => {
      cancelled = true;
    };
  }, [authLoading, t]);

  const handleRunAlerts = async () => {
    setRunningAlerts(true);
    setAlertRunError(null);
    try {
      const result = await getApiClient().admin.runAlerts();
      setAlertRun(result);
    } catch (err) {
      setAlertRunError(err instanceof Error ? err.message : t('runAlertsError'));
    } finally {
      setRunningAlerts(false);
    }
  };

  const handleSaveModel = async () => {
    setSavingModel(true);
    setModelError(null);
    setModelMessage(null);
    try {
      const result = await getApiClient().admin.setOpenRouterModel(modelInput.trim() || null);
      setOpenRouterModel(result.model);
      setModelInput(result.model ?? '');
      setModelMessage(result.model ? t('modelSavedMessage', { model: result.model }) : t('modelClearedMessage'));
    } catch (err) {
      setModelError(err instanceof Error ? err.message : t('modelSaveError'));
    } finally {
      setSavingModel(false);
    }
  };

  const handleClearModel = async () => {
    setModelInput('');
    setSavingModel(true);
    setModelError(null);
    setModelMessage(null);
    try {
      const result = await getApiClient().admin.setOpenRouterModel(null);
      setOpenRouterModel(result.model);
      setModelMessage(t('modelClearedMessage'));
    } catch (err) {
      setModelError(err instanceof Error ? err.message : t('modelSaveError'));
    } finally {
      setSavingModel(false);
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

      {error && (
        <div className="card" style={{ padding: 16, background: 'var(--color-danger-bg)', border: 'none' }}>
          <p style={{ fontSize: '0.88rem' }}>{error}</p>
        </div>
      )}

      {!error && dedupStats && (
        <div className="card stack gap-12" style={{ padding: 20 }} data-testid="admin-dedup-stats">
          <h2 style={{ fontWeight: 700, fontSize: '1.05rem' }}>{t('dedupTitle')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
            <div className="stack gap-4">
              <span className="muted" style={{ fontSize: '0.78rem' }}>{t('rawJobsCrawled')}</span>
              <strong style={{ fontSize: '1.3rem' }}>{dedupStats.totalRawJobs.toLocaleString()}</strong>
            </div>
            <div className="stack gap-4">
              <span className="muted" style={{ fontSize: '0.78rem' }}>{t('visibleCanonicalJobs')}</span>
              <strong style={{ fontSize: '1.3rem' }}>{dedupStats.visibleCanonicalJobs.toLocaleString()}</strong>
            </div>
            <div className="stack gap-4">
              <span className="muted" style={{ fontSize: '0.78rem' }}>{t('hiddenByDuplication')}</span>
              <strong style={{ fontSize: '1.3rem' }}>{dedupStats.hiddenByDuplication.toLocaleString()}</strong>
            </div>
            <div className="stack gap-4">
              <span className="muted" style={{ fontSize: '0.78rem' }}>{t('duplicateClusters')}</span>
              <strong style={{ fontSize: '1.3rem' }}>{dedupStats.totalDuplicateClusters.toLocaleString()}</strong>
              <span className="muted" style={{ fontSize: '0.75rem' }}>
                {t('duplicateClustersBreakdown', {
                  exact: dedupStats.exactDuplicateClusters,
                  near: dedupStats.nearDuplicateClusters,
                })}
              </span>
            </div>
          </div>
        </div>
      )}

      {!error && analytics && (
        <div className="card stack gap-16" style={{ padding: 20 }} data-testid="admin-analytics">
          <h2 style={{ fontWeight: 700, fontSize: '1.05rem' }}>{t('analyticsTitle')}</h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
            <div className="stack gap-4">
              <span className="muted" style={{ fontSize: '0.78rem' }}>{t('totalUsers')}</span>
              <strong style={{ fontSize: '1.3rem' }}>{analytics.userCounts.total.toLocaleString()}</strong>
              <span className="muted" style={{ fontSize: '0.75rem' }}>
                {t('userCountsBreakdown', { pro: analytics.userCounts.pro, free: analytics.userCounts.free })}
              </span>
            </div>
            <div className="stack gap-4">
              <span className="muted" style={{ fontSize: '0.78rem' }}>{t('signupsLast30Days')}</span>
              <strong style={{ fontSize: '1.3rem' }}>{analytics.signupsLast30Days.toLocaleString()}</strong>
            </div>
            <div className="stack gap-4">
              <span className="muted" style={{ fontSize: '0.78rem' }}>{t('aiTokensUsed')}</span>
              <strong style={{ fontSize: '1.3rem' }}>{analytics.tokenUsage.totalTokens.toLocaleString()}</strong>
            </div>
          </div>

          <div className="stack gap-8">
            <span className="muted" style={{ fontSize: '0.78rem' }}>{t('applicationFunnel')}</span>
            <div className="row row-wrap gap-8">
              {Object.entries(analytics.applicationFunnel).map(([status, count]) => (
                <span key={status} className="tag" data-testid={`funnel-${status}`}>
                  {t('funnelEntry', { label: FUNNEL_LABEL_KEYS[status] ? t(FUNNEL_LABEL_KEYS[status]) : status, count })}
                </span>
              ))}
            </div>
          </div>

          {analytics.tokenUsage.byFeature.length > 0 && (
            <div className="stack gap-8">
              <span className="muted" style={{ fontSize: '0.78rem' }}>{t('tokenUsageByFeature')}</span>
              <div className="row row-wrap gap-8">
                {analytics.tokenUsage.byFeature.map((f) => (
                  <span key={f.feature} className="tag">
                    {t('featureUsageEntry', {
                      feature: f.feature,
                      tokens: f.tokensUsed.toLocaleString(),
                      calls: f.callCount,
                    })}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!error && (
        <div className="card stack gap-12" style={{ padding: 20 }} data-testid="admin-alerts-card">
          <div className="row spread" style={{ flexWrap: 'wrap', gap: 12 }}>
            <div className="stack gap-4">
              <h2 style={{ fontWeight: 700, fontSize: '1.05rem' }}>{t('alertsTitle')}</h2>
              <p className="muted" style={{ fontSize: '0.8rem' }}>
                {t('alertsHint')}
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleRunAlerts}
              disabled={runningAlerts}
              data-testid="admin-run-alerts"
            >
              {runningAlerts ? t('runningAlerts') : t('runAlertsButton')}
            </button>
          </div>
          {alertRunError && (
            <p style={{ fontSize: '0.82rem', color: 'var(--color-danger)' }}>{alertRunError}</p>
          )}
          {alertRun && (
            <p style={{ fontSize: '0.85rem' }} data-testid="admin-alerts-result">
              {t('alertsResult', {
                searchesChecked: alertRun.searchesChecked,
                emailsSent: alertRun.emailsSent,
                jobsMatched: alertRun.totalJobsMatched,
              })}
            </p>
          )}
        </div>
      )}

      {!error && (
        <div className="card stack gap-12" style={{ padding: 20 }} data-testid="admin-model-override-card">
          <div className="stack gap-4">
            <h2 style={{ fontWeight: 700, fontSize: '1.05rem' }}>{t('modelOverrideTitle')}</h2>
            <p className="muted" style={{ fontSize: '0.8rem' }}>
              {t('modelOverrideHint')}
            </p>
            <p className="muted" style={{ fontSize: '0.8rem' }}>
              {openRouterModel
                ? t('modelCurrentlyActive', { model: openRouterModel })
                : t('modelUsingDefault')}
            </p>
          </div>
          <div className="row gap-8" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              className="input"
              style={{ flex: 1, minWidth: 260, fontFamily: 'var(--font-mono)' }}
              placeholder={t('modelInputPlaceholder')}
              value={modelInput}
              onChange={(e) => setModelInput(e.target.value)}
              disabled={savingModel}
              data-testid="admin-model-input"
            />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleSaveModel}
              disabled={savingModel || modelInput.trim() === (openRouterModel ?? '')}
              data-testid="admin-model-save"
            >
              {savingModel ? t('modelSaving') : t('modelSaveButton')}
            </button>
            {openRouterModel && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleClearModel}
                disabled={savingModel}
                data-testid="admin-model-clear"
              >
                {t('modelClearButton')}
              </button>
            )}
          </div>
          {modelError && <p style={{ fontSize: '0.82rem', color: 'var(--color-danger)' }}>{modelError}</p>}
          {modelMessage && (
            <p style={{ fontSize: '0.85rem' }} data-testid="admin-model-result">
              {modelMessage}
            </p>
          )}
        </div>
      )}

      {!error && !sources && <p className="muted">{t('loadingSourceHealth')}</p>}

      {!error && sources && sources.length === 0 && (
        <p className="muted">{t('noSourcesConfigured')}</p>
      )}

      {!error && sources && sources.length > 0 && (
        <div className="stack gap-12">
          {sources.map((source) => {
            const rate = successRateBadge(source.successRate, t);
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
                        {t('trustTier', { tier: source.trustTier })}
                      </span>
                      <span className={source.isActive ? 'badge badge-success' : 'badge badge-neutral'}>
                        {source.isActive ? t('statusActive') : t('statusPaused')}
                      </span>
                      <span className="muted">{t('crawlFrequency', { minutes: source.crawlFrequencyMinutes })}</span>
                    </div>
                  </div>

                  <div className="row gap-12" style={{ alignItems: 'center' }}>
                    <span className={rate.className}>{rate.label}</span>
                    {source.lastRun ? (
                      <div className="stack gap-4" style={{ textAlign: 'right' }}>
                        <span className={runStatusBadge(source.lastRun.status, t).className}>
                          {runStatusBadge(source.lastRun.status, t).label}
                        </span>
                        <span className="muted" style={{ fontSize: '0.75rem' }}>
                          {formatDate(source.lastRun.startedAt)}
                        </span>
                      </div>
                    ) : (
                      <span className="muted" style={{ fontSize: '0.8rem' }}>{t('neverRun')}</span>
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => toggleExpanded(source.id)}
                      data-testid={`admin-source-toggle-${source.sourceType}`}
                    >
                      {expanded ? t('hideHistory') : t('viewHistory')}
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="stack gap-8" style={{ borderTop: '1px solid var(--color-border)', paddingTop: 12 }}>
                    {!runs && <p className="muted" style={{ fontSize: '0.85rem' }}>{t('loadingRuns')}</p>}
                    {runs && runs.length === 0 && (
                      <p className="muted" style={{ fontSize: '0.85rem' }}>{t('noRunsRecorded')}</p>
                    )}
                    {runs?.map((run) => {
                      const badge = runStatusBadge(run.status, t);
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
                            <span>{t('jobsFetched', { count: run.jobsFetched })}</span>
                            <span>{t('jobsNew', { count: run.jobsNew })}</span>
                            <span>{t('jobsUpdated', { count: run.jobsUpdated })}</span>
                            {run.retryCount > 0 && <span>{t('retries', { count: run.retryCount })}</span>}
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
