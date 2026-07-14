import { describe, expect, it } from 'vitest';
import { RankingService } from '../ranking.service.js';
import { LABELED_QUERIES } from './dataset/queries.js';
import { ndcgAtK } from './ndcg.js';

/**
 * Ratchet, not a target: only raise this when the labeled dataset has grown
 * (Phase 3b's LLM-judge bootstrap, then periodic manual spot-checks) AND a
 * real change measurably improved the score against it. Never lower it just
 * to make a weight/formula change pass - that's exactly the blind-rebalance
 * failure mode this harness exists to prevent (rankingWeights had already
 * been hand-edited twice with no way to check whether either edit helped).
 */
const MIN_AVERAGE_NDCG = 0.85;

describe('Ranking quality eval harness', () => {
  const service = new RankingService();

  it(`achieves at least ${MIN_AVERAGE_NDCG} average nDCG across the labeled dataset`, () => {
    if (LABELED_QUERIES.length === 0) {
      throw new Error('No labeled queries in the eval dataset - see apps/api/src/jobs/eval/dataset/queries.ts');
    }

    const perQuery = LABELED_QUERIES.map((query) => {
      const scored = query.jobs.map((labeledJob) => ({
        relevance: labeledJob.relevance,
        predicted: service.score(labeledJob.job, { profile: query.profile }).totalScore,
      }));
      // Rank by what the service actually predicted, not by label order -
      // nDCG must be computed against the order a real user would see.
      const rankedRelevances = [...scored].sort((a, b) => b.predicted - a.predicted).map((s) => s.relevance);
      const topPredicted = Math.max(...scored.map((s) => s.predicted));
      return { id: query.id, ndcg: ndcgAtK(rankedRelevances), topPredicted };
    });

    const average = perQuery.reduce((sum, q) => sum + q.ndcg, 0) / perQuery.length;

    // Printed on every run, pass or fail - this is the "report" half of the
    // harness, not just a pass/fail gate.
    console.log('\nRanking eval report:');
    for (const q of perQuery) {
      console.log(`  ${q.id}: nDCG@k = ${q.ndcg.toFixed(3)}, top totalScore = ${q.topPredicted.toFixed(3)}`);
    }
    console.log(`  AVERAGE: ${average.toFixed(3)} (bar: ${MIN_AVERAGE_NDCG})\n`);

    expect(average).toBeGreaterThanOrEqual(MIN_AVERAGE_NDCG);
  });
});
