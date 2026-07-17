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

  it('reports hard-negative rank violations (visibility only, not yet a gate)', () => {
    /*
     * Invariant Gate 2's cascade must eventually satisfy: within a query, no
     * isHardNegative job (a deliberately constructed collision/over-collapse
     * risk case - see gate1-queries.ts) may predict a HIGHER score than any
     * job the human labeler graded relevance >= 3 in the same query. Rank-
     * based, not a fixed low-score threshold, because hard negatives span
     * the full 0-4 grade range - some are genuine cap cases (a real
     * seniority/scope gap, correctly graded 2), not "should always score
     * near zero."
     *
     * NOT a hard-failing assertion yet: these cases were deliberately built
     * to be adversarial for exactly the failure mode the current Tier-1-only
     * matcher has no defense against - that is the entire point of Gate 1.
     * Gating on it now would fail immediately with no actionable fix
     * available, the same reasoning that kept topPredicted reporting-only
     * when it was added. This becomes a real gate once Gate 2's cascade
     * ships and is expected to satisfy it.
     */
    const violations: string[] = [];
    let hardNegativeCount = 0;

    for (const query of LABELED_QUERIES) {
      const scored = query.jobs.map((labeledJob) => ({
        relevance: labeledJob.relevance,
        isHardNegative: labeledJob.isHardNegative ?? false,
        jobId: labeledJob.job.jobId,
        predicted: service.score(labeledJob.job, { profile: query.profile }).totalScore,
      }));
      hardNegativeCount += scored.filter((s) => s.isHardNegative).length;

      const relevantScores = scored.filter((s) => s.relevance >= 3).map((s) => s.predicted);
      if (relevantScores.length === 0) continue;
      const minRelevantScore = Math.min(...relevantScores);

      for (const s of scored) {
        if (s.isHardNegative && s.predicted > minRelevantScore) {
          violations.push(
            `${query.id} / ${s.jobId}: hard-negative predicted ${s.predicted.toFixed(3)} outranks the query's own relevance>=3 floor of ${minRelevantScore.toFixed(3)}`,
          );
        }
      }
    }

    console.log(`\nHard-negative rank check: ${violations.length}/${hardNegativeCount} hard negatives currently outrank a relevance>=3 job in their own query.`);
    if (violations.length > 0) {
      for (const v of violations) console.log(`  - ${v}`);
    }
    console.log('');
  });
});
