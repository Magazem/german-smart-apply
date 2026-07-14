/**
 * Standard nDCG@k (normalized discounted cumulative gain): graded-relevance
 * ranking quality, standard for search/recommendation eval. `rankedRelevances`
 * must already be in the order the system under test actually produced -
 * this function does not sort by relevance itself, only by the caller's order.
 *
 * Gain uses 2^relevance - 1 (a relevance-4 result counts far more than a
 * relevance-1 one, not linearly) with a log2(rank+1) position discount,
 * normalized against the same relevances in their ideal (best-first) order
 * so the result is always in [0, 1] regardless of how many jobs were labeled.
 */
export function ndcgAtK(rankedRelevances: readonly number[], k?: number): number {
  const limit = k ?? rankedRelevances.length;
  const dcg = (relevances: readonly number[]): number =>
    relevances
      .slice(0, limit)
      .reduce((sum, relevance, index) => sum + (Math.pow(2, relevance) - 1) / Math.log2(index + 2), 0);

  const idealDcg = dcg([...rankedRelevances].sort((a, b) => b - a));
  // No relevant jobs at all in this label set - there's nothing a ranking
  // could get right or wrong, so treat it as a perfect (not a zero) score
  // rather than dividing by zero.
  if (idealDcg === 0) return 1;

  return dcg(rankedRelevances) / idealDcg;
}
