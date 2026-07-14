import { describe, expect, it } from 'vitest';
import type { CanonicalJob } from '@german-smart-apply/shared';
import { RankingService, type RankingProfileInput } from './ranking.service.js';

function buildJob(overrides: Partial<CanonicalJob> = {}): CanonicalJob {
  return {
    jobId: 'job-1',
    sourceId: 'source-1',
    sourceType: 'greenhouse',
    sourceUrl: 'https://example.com',
    originalJobId: 'ext-1',
    companyNameRaw: 'Acme GmbH',
    companyNameNormalized: 'acme gmbh',
    jobTitleRaw: 'Backend Engineer',
    jobTitleNormalized: 'backend engineer',
    jobDescriptionHtml: null,
    jobDescriptionText: 'Build APIs.',
    language: 'en',
    locationRaw: 'Berlin',
    locationNormalized: 'Berlin',
    countryCode: 'DE',
    remoteType: 'hybrid',
    employmentType: 'full_time',
    seniority: 'mid',
    salaryMin: 40000,
    salaryMax: 55000,
    salaryCurrency: 'EUR',
    techStackTags: [],
    applyUrl: 'https://example.com/apply',
    postedAt: new Date().toISOString(),
    crawledAt: new Date().toISOString(),
    sourceTrustScore: 0.9,
    scamRiskScore: 0.02,
    duplicateConfidence: 1,
    ...overrides,
  };
}

function buildProfile(overrides: Partial<RankingProfileInput> = {}): RankingProfileInput {
  return {
    skills: [],
    targetRole: 'Backend Engineer',
    targetCountryCode: 'DE',
    preferredLanguage: 'en',
    seniority: 'mid',
    locationPreference: 'any',
    salaryTargetMin: null,
    salaryTargetMax: null,
    commutePreferenceKm: null,
    ...overrides,
  };
}

describe('RankingService.score - salaryFit', () => {
  const service = new RankingService();

  it('gives a neutral 0.5 salaryFit when the candidate genuinely has no salary preference', () => {
    const result = service.score(buildJob(), { profile: buildProfile() });
    expect(result.salaryFit).toBe(0.5);
  });

  it('treats an explicit salaryTargetMin of 0 as "no floor", not "unset" - job clearing it scores a perfect fit', () => {
    const result = service.score(buildJob({ salaryMin: 40000, salaryMax: 55000 }), {
      profile: buildProfile({ salaryTargetMin: 0, salaryTargetMax: null }),
    });
    expect(result.salaryFit).toBe(1);
  });

  it('still scores a perfect fit when the job range comfortably clears a real target minimum', () => {
    const result = service.score(buildJob({ salaryMin: 40000, salaryMax: 120000 }), {
      profile: buildProfile({ salaryTargetMin: 60000 }),
    });
    expect(result.salaryFit).toBe(1);
  });

  it('penalizes a job whose range does not overlap the target range', () => {
    const result = service.score(buildJob({ salaryMin: 30000, salaryMax: 35000 }), {
      profile: buildProfile({ salaryTargetMin: 60000, salaryTargetMax: 80000 }),
    });
    expect(result.salaryFit).toBe(0.1);
  });
});

describe('RankingService.score - eligibility (hard constraints) vs. locationFit (soft fit)', () => {
  const service = new RankingService();

  it('reports eligible: true and an unpenalized locationFit when the job matches the target country', () => {
    const job = buildJob({ countryCode: 'DE', remoteType: 'hybrid' });
    const result = service.score(job, { profile: buildProfile({ targetCountryCode: 'DE', locationPreference: 'hybrid' }) });
    expect(result.eligible).toBe(true);
    expect(result.locationFit).toBe(1);
  });

  it('reports eligible: false on a country mismatch, but leaves locationFit reporting pure work-mode fit', () => {
    const job = buildJob({ countryCode: 'ES', remoteType: 'hybrid' });
    const result = service.score(job, { profile: buildProfile({ targetCountryCode: 'DE', locationPreference: 'hybrid' }) });
    expect(result.eligible).toBe(false);
    // locationFit no longer folds the country mismatch in - it's the same
    // pure work-mode fit as the DE case above, not silently discounted.
    expect(result.locationFit).toBe(1);
  });

  it('still discounts totalScore for a country mismatch, via the separate eligibilityPenalty', () => {
    const jobMatch = buildJob({ countryCode: 'DE', remoteType: 'hybrid' });
    const jobMismatch = buildJob({ countryCode: 'ES', remoteType: 'hybrid' });
    const profile = buildProfile({ targetCountryCode: 'DE', locationPreference: 'hybrid' });
    const eligible = service.score(jobMatch, { profile });
    const ineligible = service.score(jobMismatch, { profile });
    expect(ineligible.totalScore).toBeLessThan(eligible.totalScore);
  });

  it('treats an empty targetCountryCode as no hard constraint - always eligible', () => {
    const job = buildJob({ countryCode: 'ES' });
    const result = service.score(job, { profile: buildProfile({ targetCountryCode: '' }) });
    expect(result.eligible).toBe(true);
  });

  it('defaults eligible to true when there is no profile to check against', () => {
    const job = buildJob({ countryCode: 'ES' });
    const result = service.score(job, { profile: null });
    expect(result.eligible).toBe(true);
  });
});

describe('RankingService.score - interactionBias', () => {
  const service = new RankingService();

  it('boosts totalScore for a job the user liked, relative to the same job with no feedback', () => {
    const job = buildJob();
    const neutral = service.score(job, { profile: buildProfile() });
    const liked = service.score(job, { profile: buildProfile(), interactionBias: 1 });
    expect(liked.totalScore).toBeGreaterThan(neutral.totalScore);
  });

  it('lowers totalScore for a job the user skipped, relative to the same job with no feedback', () => {
    const job = buildJob();
    const neutral = service.score(job, { profile: buildProfile() });
    const skipped = service.score(job, { profile: buildProfile(), interactionBias: -1 });
    expect(skipped.totalScore).toBeLessThan(neutral.totalScore);
  });

  it('leaves totalScore unchanged when interactionBias is undefined (no feedback recorded)', () => {
    const job = buildJob();
    const withUndefined = service.score(job, { profile: buildProfile(), interactionBias: undefined });
    const withoutField = service.score(job, { profile: buildProfile() });
    expect(withUndefined.totalScore).toBe(withoutField.totalScore);
  });
});

describe('RankingService.score - locationFit commutePreferenceKm placeholder', () => {
  const service = new RankingService();

  it('discounts an onsite match when the candidate has set a commute radius (unverifiable without geo data)', () => {
    const job = buildJob({ remoteType: 'onsite' });
    const withoutCommutePref = service.score(job, {
      profile: buildProfile({ locationPreference: 'onsite', commutePreferenceKm: null }),
    });
    const withCommutePref = service.score(job, {
      profile: buildProfile({ locationPreference: 'onsite', commutePreferenceKm: 20 }),
    });
    expect(withoutCommutePref.locationFit).toBe(1);
    expect(withCommutePref.locationFit).toBeCloseTo(0.9);
  });

  it('also discounts a hybrid match, not just onsite', () => {
    const job = buildJob({ remoteType: 'hybrid' });
    const result = service.score(job, {
      profile: buildProfile({ locationPreference: 'hybrid', commutePreferenceKm: 20 }),
    });
    expect(result.locationFit).toBeCloseTo(0.9);
  });

  it('does not discount a fully remote job, even with a commute radius set', () => {
    const job = buildJob({ remoteType: 'remote' });
    const result = service.score(job, {
      profile: buildProfile({ locationPreference: 'remote', commutePreferenceKm: 20 }),
    });
    expect(result.locationFit).toBe(1);
  });
});
