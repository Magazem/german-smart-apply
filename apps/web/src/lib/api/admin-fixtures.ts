import type { DedupStats, SourceCrawlRun, SourceHealth } from './types';

/**
 * Deterministic demo data for the admin source-health panel in mock mode.
 * Mirrors the 4 sources actually configured in workers/common/market_de.py
 * (kept in sync manually, same as that file's own header note) so the mock
 * walkthrough looks like a plausible snapshot of the real crawler fleet,
 * not an arbitrary shape. Timestamps are relative to module-load time so a
 * demo session always shows "recent" activity.
 */
function runAt(hoursAgo: number, status: SourceCrawlRun['status'], overrides: Partial<SourceCrawlRun> = {}): SourceCrawlRun {
  const startedAt = new Date(Date.now() - hoursAgo * 3_600_000);
  const finishedAt = new Date(startedAt.getTime() + 4 * 60_000);
  return {
    id: `run-${hoursAgo}-${status}`,
    status,
    startedAt: startedAt.toISOString(),
    finishedAt: status === 'running' ? null : finishedAt.toISOString(),
    jobsFetched: status === 'failure' ? 0 : 40,
    jobsNew: status === 'failure' ? 0 : 6,
    jobsUpdated: status === 'failure' ? 0 : 34,
    errorLog: null,
    retryCount: 0,
    ...overrides,
  };
}

function buildSource(
  base: Omit<SourceHealth, 'lastRun' | 'recentRunCount' | 'successRate'>,
  runs: SourceCrawlRun[],
): { health: SourceHealth; runs: SourceCrawlRun[] } {
  const completed = runs.filter((r) => r.status !== 'running');
  const successCount = completed.filter((r) => r.status === 'success').length;
  return {
    health: {
      ...base,
      lastRun: runs[0] ?? null,
      recentRunCount: runs.length,
      successRate: completed.length > 0 ? successCount / completed.length : null,
    },
    runs,
  };
}

const ARBEITSAGENTUR = buildSource(
  {
    id: 'src-arbeitsagentur',
    sourceType: 'arbeitsagentur',
    displayName: 'Bundesagentur für Arbeit — Jobsuche API',
    countryCode: 'DE',
    trustTier: 'high',
    isActive: true,
    crawlFrequencyMinutes: 360,
  },
  [runAt(2, 'success'), runAt(8, 'success'), runAt(14, 'success'), runAt(20, 'success')],
);

const GREENHOUSE = buildSource(
  {
    id: 'src-greenhouse',
    sourceType: 'greenhouse',
    displayName: 'Greenhouse (DE companies)',
    countryCode: 'DE',
    trustTier: 'high',
    isActive: true,
    crawlFrequencyMinutes: 240,
  },
  [runAt(1, 'success'), runAt(5, 'success'), runAt(9, 'partial_failure', { jobsUpdated: 12, errorLog: '2 of 14 board tokens returned HTTP 429 (rate limited); retried next cycle.' }), runAt(13, 'success')],
);

const LEVER = buildSource(
  {
    id: 'src-lever',
    sourceType: 'lever',
    displayName: 'Lever (DE companies)',
    countryCode: 'DE',
    trustTier: 'high',
    isActive: true,
    crawlFrequencyMinutes: 240,
  },
  [runAt(3, 'success'), runAt(7, 'success'), runAt(11, 'success')],
);

const STEPSTONE = buildSource(
  {
    id: 'src-stepstone',
    sourceType: 'stepstone',
    displayName: 'Stepstone structured feed',
    countryCode: 'DE',
    trustTier: 'medium',
    isActive: true,
    crawlFrequencyMinutes: 360,
  },
  [
    runAt(4, 'failure', { errorLog: 'No documented public structured-feed API — placeholder endpoint returned HTTP 404.' }),
    runAt(10, 'failure', { errorLog: 'No documented public structured-feed API — placeholder endpoint returned HTTP 404.' }),
    runAt(16, 'failure', { errorLog: 'No documented public structured-feed API — placeholder endpoint returned HTTP 404.' }),
  ],
);

export const SOURCE_HEALTH_FIXTURES: Array<{ health: SourceHealth; runs: SourceCrawlRun[] }> = [
  ARBEITSAGENTUR,
  GREENHOUSE,
  LEVER,
  STEPSTONE,
];

/**
 * Demo-only dedup snapshot, same rationale as SOURCE_HEALTH_FIXTURES above -
 * plausible round numbers for the mock walkthrough, not derived from real
 * crawl counts (jobsFetched per run isn't a running unique-jobs total, so
 * deriving one from the other would just be fictitious math wearing a
 * "computed" costume).
 */
export const DEDUP_STATS_FIXTURE: DedupStats = {
  totalRawJobs: 1240,
  totalCanonicalJobs: 1180,
  visibleCanonicalJobs: 1112,
  hiddenByDuplication: 68,
  totalDuplicateClusters: 60,
  exactDuplicateClusters: 45,
  nearDuplicateClusters: 15,
  totalDuplicateClusterMembers: 128,
};
