import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { TokenUsageService } from '../token-usage/token-usage.service.js';
import type { AiProviderFactory } from '../ai/ai-provider-factory.service.js';
import { JobsService } from './jobs.service.js';
import { RankingService } from './ranking.service.js';

/**
 * Regression test for how the ranking candidate pool is selected.
 *
 * JobsService hard-caps the pool at CANDIDATE_POOL_SIZE (200) rows and scores
 * only those, so whatever the ORDER BY puts first is what can be matched at all -
 * anything outside the cut is unreachable no matter how well it fits. `postedAt`
 * is nullable and Postgres sorts NULLs FIRST on DESC, so the original
 * `orderBy: { postedAt: 'desc' }` considered every undated posting before any
 * dated one. On real crawled data (several adapters leave postedAt null when the
 * source publishes no date) that starved ranking of the recent jobs it exists to
 * rank.
 *
 * This asserts the query itself rather than the results, because the behaviour
 * lives in SQL that only Postgres can demonstrate - and no database is available
 * to the unit suite.
 */
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

describe('JobsService.search candidate pool', () => {
  it('orders the candidate pool by postedAt DESC with NULLs LAST', async () => {
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

  it('still restricts the pool to visible jobs and caps its size', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await makeService(findMany).search({});

    const args = findMany.mock.calls[0][0];
    expect(args.where.isVisible).toBe(true);
    expect(args.take).toBe(200);
  });
});
