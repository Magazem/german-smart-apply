import type { CanonicalJob } from '@german-smart-apply/shared';
import type { RankingProfileInput } from '../../ranking.service.js';

/**
 * Deliberately separate from ranking.service.test.ts's buildJob/buildProfile:
 * those are minimal unit-test defaults, tuned to isolate one field at a time.
 * These build representative, realistic-looking pairs for the eval dataset,
 * and the two should be free to diverge without one file's edits silently
 * changing the other's fixtures.
 */
export function buildEvalJob(overrides: Partial<CanonicalJob> & Pick<CanonicalJob, 'jobId'>): CanonicalJob {
  return {
    sourceId: 'eval-source',
    sourceType: 'greenhouse',
    sourceUrl: 'https://example.com',
    originalJobId: overrides.jobId,
    companyNameRaw: 'Example GmbH',
    companyNameNormalized: 'example gmbh',
    jobTitleRaw: overrides.jobTitleNormalized ?? 'Untitled role',
    jobTitleNormalized: 'untitled role',
    jobDescriptionHtml: null,
    jobDescriptionText: '',
    language: 'en',
    locationRaw: 'Berlin, Germany',
    locationNormalized: 'Berlin',
    countryCode: 'DE',
    remoteType: 'hybrid',
    employmentType: 'full_time',
    seniority: 'mid',
    salaryMin: null,
    salaryMax: null,
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

export function buildEvalProfile(overrides: Partial<RankingProfileInput> = {}): RankingProfileInput {
  return {
    skills: [],
    targetRole: '',
    targetCountryCode: 'DE',
    preferredLanguage: 'en',
    // Deliberately matches buildEvalJob's default `language: 'en'`, which
    // reproduces exactly what the old preferredLanguage-based languageFit
    // scored for these fixtures (1). Leaving it empty would make languageFit
    // null across the whole dataset and shift every NDCG number for a reason
    // unrelated to ranking quality, masking the skill/location deltas this
    // dataset exists to measure. Cases that care about a language mismatch
    // should override it explicitly.
    languages: ['en'],
    seniority: 'mid',
    locationPreference: 'any',
    // Empty by default: city scoring stays dormant ('unknown') unless a case
    // opts in, so existing queries measure what they always did.
    homeCity: null,
    acceptableCities: [],
    relocationWillingness: null,
    salaryTargetMin: null,
    salaryTargetMax: null,
    commutePreferenceKm: null,
    ...overrides,
  };
}
