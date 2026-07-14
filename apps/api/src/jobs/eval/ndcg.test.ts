import { describe, expect, it } from 'vitest';
import { ndcgAtK } from './ndcg.js';

describe('ndcgAtK', () => {
  it('scores a perfect (best-first) ordering as 1', () => {
    expect(ndcgAtK([4, 3, 2, 0])).toBeCloseTo(1);
  });

  it('scores an exactly-reversed ordering below a perfect one', () => {
    const perfect = ndcgAtK([4, 3, 2, 0]);
    const reversed = ndcgAtK([0, 2, 3, 4]);
    expect(reversed).toBeLessThan(perfect);
  });

  it('penalizes a single high-relevance result ranked last more than a minor reshuffle', () => {
    const minorReshuffle = ndcgAtK([4, 2, 3, 0]); // adjacent swap near the top
    const worstFirst = ndcgAtK([0, 2, 3, 4]); // the one truly relevant result buried last
    expect(minorReshuffle).toBeGreaterThan(worstFirst);
  });

  it('returns 1 for an all-irrelevant label set (nothing to rank correctly or incorrectly)', () => {
    expect(ndcgAtK([0, 0, 0])).toBe(1);
  });

  it('is unaffected by results beyond k', () => {
    const withTail = ndcgAtK([4, 0, 0, 0, 3], 1);
    const topOnly = ndcgAtK([4], 1);
    expect(withTail).toBeCloseTo(topOnly);
  });
});
