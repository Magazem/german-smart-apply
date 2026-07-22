import { describe, expect, it } from 'vitest';
import type { CanonicalJob, MarketPack } from '@german-smart-apply/shared';
import { computeMatchScoreEstimate, parseMatchScoreEstimateDimensions } from './match-score-estimate.js';

const weights: MarketPack['rankingWeights'] = {
  titleSimilarity: 0.32,
  skillOverlap: 0.32,
  locationFit: 0.1,
  recency: 0.07,
  salaryFit: 0.08,
  languageFit: 0.03,
  sourceTrust: 0.03,
  riskPenalty: 0.05,
};

const job: CanonicalJob = {
  jobId: 'j1',
  sourceId: 's1',
  sourceType: 'greenhouse',
  sourceUrl: 'https://example.com',
  originalJobId: 'ext-1',
  companyNameRaw: 'Acme GmbH',
  companyNameNormalized: 'acme gmbh',
  jobTitleRaw: 'Senior Backend Engineer',
  jobTitleNormalized: 'senior backend engineer',
  jobDescriptionHtml: null,
  jobDescriptionText: 'Build APIs.',
  language: 'en',
  locationRaw: 'Berlin',
  locationNormalized: 'Berlin',
  countryCode: 'DE',
  remoteType: 'hybrid',
  employmentType: 'full_time',
  seniority: 'senior',
  salaryMin: 70000,
  salaryMax: 90000,
  salaryCurrency: 'EUR',
  techStackTags: ['TypeScript', 'PostgreSQL'],
  applyUrl: 'https://example.com/apply',
  postedAt: null,
  crawledAt: new Date().toISOString(),
  sourceTrustScore: 0.9,
  scamRiskScore: 0.02,
  duplicateConfidence: 1,
};

describe('computeMatchScoreEstimate', () => {
  it('reproduces ranking.service.ts\'s weighted formula exactly for known inputs', () => {
    // weightedPositive = 0.8*0.32 + 0.6*0.32 + 0.7*0.1 + recency(0.4, postedAt=null)*0.07
    //                   + 0.5*0.08 + 1*0.03 + sourceTrust(0.9)*0.03
    //                  = 0.256 + 0.192 + 0.07 + 0.028 + 0.04 + 0.03 + 0.027 = 0.643
    // totalScore = 0.643 - riskPenalty(scamRiskScore=0.02)*0.05 = 0.643 - 0.001 = 0.642 -> 64%
    const percentage = computeMatchScoreEstimate(
      { titleSimilarity: 0.8, skillOverlap: 0.6, locationFit: 0.7, languageFit: 1, salaryFit: 0.5 },
      job,
      weights,
    );
    expect(percentage).toBe(64);
  });

  it('clamps the result to 0-100 rather than going negative or over', () => {
    const tenYearsAgo = new Date(Date.now() - 10 * 365 * 24 * 60 * 60 * 1000).toISOString();
    const zero = computeMatchScoreEstimate(
      { titleSimilarity: 0, skillOverlap: 0, locationFit: 0, languageFit: 0, salaryFit: 0 },
      // Zero out every dimension including the three objective facts (recency via a
      // decade-old postedAt, sourceTrust directly) so the only remaining term is the
      // riskPenalty subtraction, which would otherwise push this negative pre-clamp.
      { ...job, scamRiskScore: 1, sourceTrustScore: 0, postedAt: tenYearsAgo },
      weights,
    );
    expect(zero).toBe(0);

    // The seven positive weights (0.32+0.32+0.1+0.07+0.08+0.03+0.03) sum to 0.95, not 1 -
    // riskPenalty's 0.05 is carved out as a separate subtraction, not added on top. So even
    // a perfect match with zero risk tops out at 95%, matching ranking.service.ts exactly
    // (same weights, same formula) - 100% is never actually reachable.
    const best = computeMatchScoreEstimate(
      { titleSimilarity: 1, skillOverlap: 1, locationFit: 1, languageFit: 1, salaryFit: 1 },
      { ...job, scamRiskScore: 0, sourceTrustScore: 1, postedAt: new Date().toISOString() },
      weights,
    );
    expect(best).toBe(95);
  });

  it('decays recency with a 14-day half-life, mirroring ranking.service.ts', () => {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const fresh = computeMatchScoreEstimate(
      { titleSimilarity: 0.5, skillOverlap: 0.5, locationFit: 0.5, languageFit: 0.5, salaryFit: 0.5 },
      { ...job, postedAt: new Date().toISOString() },
      weights,
    );
    const halfLifeOld = computeMatchScoreEstimate(
      { titleSimilarity: 0.5, skillOverlap: 0.5, locationFit: 0.5, languageFit: 0.5, salaryFit: 0.5 },
      { ...job, postedAt: fourteenDaysAgo },
      weights,
    );
    // fresh: weightedPositive = 0.5*(0.32+0.32+0.1+0.08+0.03) + recency(1)*0.07 + sourceTrust(0.9)*0.03 = 0.522
    //        totalScore = 0.522 - 0.02*0.05 = 0.521 -> 52%
    // halfLifeOld: recency=0.5 instead of 1, so weightedPositive = 0.522 - 0.07*0.5 = 0.487
    //        totalScore = 0.487 - 0.001 = 0.486 -> 49%
    expect(fresh).toBe(52);
    expect(halfLifeOld).toBe(49);
  });
});

describe('parseMatchScoreEstimateDimensions', () => {
  it('clamps out-of-range values into 0-1', () => {
    const dims = parseMatchScoreEstimateDimensions(
      { titleSimilarity: 1.5, skillOverlap: -0.5, locationFit: 0.5, languageFit: 0.5, salaryFit: 0.5 },
      'test',
    );
    expect(dims.titleSimilarity).toBe(1);
    expect(dims.skillOverlap).toBe(0);
  });

  it('throws malformed_response when a dimension is missing', () => {
    expect(() =>
      parseMatchScoreEstimateDimensions({ titleSimilarity: 0.5, skillOverlap: 0.5, locationFit: 0.5 }, 'test'),
    ).toThrow(/missing numeric/);
  });

  it('throws malformed_response when the input is not an object', () => {
    expect(() => parseMatchScoreEstimateDimensions('not an object', 'test')).toThrow(/not a JSON object/);
  });
});
