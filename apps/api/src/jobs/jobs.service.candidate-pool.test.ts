import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { TokenUsageService } from '../token-usage/token-usage.service.js';
import type { AiProviderFactory } from '../ai/ai-provider-factory.service.js';
import { JobsService } from './jobs.service.js';
import { RankingService } from './ranking.service.js';

/**
 * Regression tests for how the ranking candidate set is selected.
 *
 * Two separate bugs live here, both of which made a well-fitting job
 * unreachable rather than merely mis-ordered:
 *
 * 1. The pool was hard-capped at 200 rows ordered by postedAt, and only those
 *    were scored. With ~12.9k visible jobs that made 98.4% of the corpus
 *    unscorable, and the cut reached back about 21 hours - so the best match
 *    was returned only if it happened to be posted that day. search() now
 *    scores every row matching the filters.
 * 2. `postedAt` is nullable and Postgres sorts NULLs FIRST on DESC, so a bare
 *    `orderBy: { postedAt: 'desc' }` put every undated posting ahead of every
 *    dated one. That ordering no longer decides what gets scored, but it still
 *    decides which rows survive the MAX_SCORED_CANDIDATES safety ceiling, so
 *    it still has to be NULLS LAST.
 *
 * The query-shape assertions check the query itself rather than results,
 * because that behaviour lives in SQL only Postgres can demonstrate and no
 * database is available to the unit suite. The ranking assertion at the bottom
 * covers the user-visible symptom directly.
 */

/** A row shaped like the narrow SCORING_SELECT projection search() fetches. */
function scoringRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    jobTitleNormalized: 'something else entirely',
    techStackTags: [],
    language: 'en',
    countryCode: 'DE',
    remoteType: 'onsite',
    locationNormalized: 'Berlin',
    salaryMin: null,
    salaryMax: null,
    postedAt: new Date('2026-07-30T00:00:00Z'),
    sourceTrustScore: 0.8,
    scamRiskScore: 0,
    duplicateConfidence: 1,
    rawJob: { jobDescriptionText: '' },
    ...overrides,
  };
}

/** A row shaped like the full `include` used to hydrate the returned page. */
function hydratedRow(id: string, title: string) {
  return {
    id,
    companyNameNormalized: 'acme',
    jobTitleNormalized: title,
    locationNormalized: 'Berlin',
    countryCode: 'DE',
    remoteType: 'onsite',
    employmentType: 'full_time',
    seniority: null,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    techStackTags: [],
    language: 'en',
    sourceTrustScore: 0.8,
    scamRiskScore: 0,
    duplicateConfidence: 1,
    postedAt: new Date('2026-07-30T00:00:00Z'),
    crawledAt: new Date('2026-07-30T00:00:00Z'),
    rawJob: {
      sourceId: 'src-1',
      sourceUrl: 'https://example.test/j',
      originalJobId: id,
      companyNameRaw: 'Acme',
      jobTitleRaw: title,
      jobDescriptionHtml: null,
      jobDescriptionText: '',
      locationRaw: 'Berlin',
      applyUrl: 'https://example.test/apply',
      source: { sourceType: 'greenhouse' },
    },
  };
}

function stubPrisma(findMany: ReturnType<typeof vi.fn>): PrismaService {
  return {
    client: {
      canonicalJob: { findMany },
      candidateProfile: { findUnique: vi.fn().mockResolvedValue(null) },
      jobInteraction: { findMany: vi.fn().mockResolvedValue([]) },
    },
  } as unknown as PrismaService;
}

function makeService(findMany: ReturnType<typeof vi.fn>): JobsService {
  return new JobsService(
    stubPrisma(findMany),
    new RankingService(),
    {} as TokenUsageService,
    {} as AiProviderFactory,
  );
}

describe('JobsService.search candidate selection', () => {
  it('orders by postedAt DESC with NULLs LAST at the safety ceiling', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await makeService(findMany).search({});

    const args = findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual({ postedAt: { sort: 'desc', nulls: 'last' } });
  });

  it('does not use the bare string form, which Postgres reads as NULLS FIRST', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await makeService(findMany).search({});

    const args = findMany.mock.calls[0][0];
    expect(args.orderBy).not.toEqual({ postedAt: 'desc' });
  });

  it('restricts to visible jobs and no longer truncates to the old 200-row pool', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await makeService(findMany).search({});

    const args = findMany.mock.calls[0][0];
    expect(args.where.isVisible).toBe(true);
    // The remaining `take` is an anti-OOM ceiling, not a ranking pool: it has
    // to sit far above the whole visible corpus, so a job is never dropped
    // from consideration for being merely old.
    expect(args.take).toBeGreaterThanOrEqual(50_000);
  });

  it('fetches the description text it scores against, but not the HTML it does not', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await makeService(findMany).search({});

    const args = findMany.mock.calls[0][0];
    expect(args.select.rawJob.select.jobDescriptionText).toBe(true);
    expect(args.select.rawJob.select.jobDescriptionHtml).toBeUndefined();
    expect(args.include).toBeUndefined();
  });

  it('ranks an older, better-matching job above a newer, worse-matching one', async () => {
    // The bug this file exists for, stated as behaviour: the good match is
    // older than the noise, which is exactly the case the recency-truncated
    // pool could never return.
    const findMany = vi
      .fn()
      // 1st call: the scoring projection over everything matching the filters.
      .mockResolvedValueOnce([
        scoringRow({
          id: 'newer-but-irrelevant',
          jobTitleNormalized: 'warehouse cleaning associate',
          postedAt: new Date('2026-07-30T00:00:00Z'),
        }),
        scoringRow({
          id: 'older-but-perfect',
          jobTitleNormalized: 'data engineer',
          postedAt: new Date('2024-01-01T00:00:00Z'),
        }),
      ])
      // 2nd call: hydration of the returned page.
      .mockResolvedValueOnce([
        hydratedRow('newer-but-irrelevant', 'warehouse cleaning associate'),
        hydratedRow('older-but-perfect', 'data engineer'),
      ]);

    const result = await makeService(findMany).search({ query: 'data engineer' });

    expect(result.total).toBe(2);
    expect(result.results[0].job.jobId).toBe('older-but-perfect');
    expect(result.results[0].score.totalScore).toBeGreaterThan(result.results[1].score.totalScore);
  });

  it('reports the true match count, not the size of a truncated pool', async () => {
    const rows = Array.from({ length: 750 }, (_, i) => scoringRow({ id: `job-${i}` }));
    const findMany = vi.fn().mockResolvedValueOnce(rows).mockResolvedValueOnce([]);

    const result = await makeService(findMany).search({});

    expect(result.total).toBe(750);
  });
});
