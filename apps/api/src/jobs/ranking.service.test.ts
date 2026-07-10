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
