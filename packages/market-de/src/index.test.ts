import { describe, expect, it } from 'vitest';
import { marketDe } from './index.js';

describe('marketDe pack', () => {
  it('is scoped to Germany and active', () => {
    expect(marketDe.countryCode).toBe('DE');
    expect(marketDe.status).toBe('active');
  });

  it('declares at least the four Phase 1 trusted sources', () => {
    expect(marketDe.sources.length).toBeGreaterThanOrEqual(4);
    const sourceTypes = marketDe.sources.map((s) => s.sourceType);
    expect(sourceTypes).toContain('greenhouse');
    expect(sourceTypes).toContain('lever');
    expect(sourceTypes).toContain('arbeitsagentur');
  });

  it('ranking weights sum to 1 (within floating point tolerance)', () => {
    const sum = Object.values(marketDe.rankingWeights).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it('has non-empty scam heuristics', () => {
    expect(marketDe.scamHeuristics.suspiciousDomainPatterns.length).toBeGreaterThan(0);
    expect(marketDe.scamHeuristics.suspiciousContactPatterns.length).toBeGreaterThan(0);
  });
});
