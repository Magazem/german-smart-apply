import { describe, expect, it } from 'vitest';
import { marketDe } from '@german-smart-apply/market-de';
import type { CandidateProfile, CanonicalJob } from '@german-smart-apply/shared';
import { AnthropicAiProvider } from './anthropic-provider.js';

/**
 * Live integration test against the real Anthropic API.
 *
 * This sandbox has no ANTHROPIC_API_KEY, so every test below is SKIPPED here
 * (not failed) via `it.skipIf`. It exists so that:
 *   - anyone with a real key can run `ANTHROPIC_API_KEY=sk-... pnpm test` and
 *     get real end-to-end coverage of prompt building + response parsing
 *     against the live API, not just the fake-client unit tests; and
 *   - this satisfies plan.md's Phase-1 quality gate: "if a step requires a
 *     real API key that is not available, stub the external call but leave
 *     a clear TODO and integration test shell."
 *
 * TODO(whoever has a key): run this locally/in CI-with-secrets at least once
 * per model-routing change to confirm the tool schema and market prompts
 * still produce parseable output from the real API.
 */
const hasRealKey = Boolean(process.env.ANTHROPIC_API_KEY);

const profile: CandidateProfile = {
  id: 'p1',
  userId: 'u1',
  fullName: 'Jane Doe',
  email: 'jane@example.com',
  phone: '+49 151 1234567',
  targetRole: 'Backend Engineer',
  targetCountryCode: 'DE',
  preferredLanguage: 'en',
  seniority: 'senior',
  locationPreference: 'hybrid',
  skills: ['TypeScript', 'PostgreSQL', 'Kubernetes'],
  summary: null,
  experience: [],
  education: [],
  languages: ['en', 'de'],
  salaryTargetMin: null,
  salaryTargetMax: null,
  workAuthorization: null,
  companyBlacklist: [],
  commutePreferenceKm: null,
  portfolioLinks: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
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
  jobDescriptionText: 'Build and operate APIs used by millions of users.',
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
};

describe('AnthropicAiProvider (live integration)', () => {
  const provider = new AnthropicAiProvider(marketDe);

  it.skipIf(!hasRealKey)(
    'generates a real match explanation and reports real token usage',
    async () => {
      const result = await provider.generateMatchExplanation(profile, job, 'en');
      expect(result.text.length).toBeGreaterThan(0);
      expect(result.modelUsed).toContain('claude');
      expect(result.tokensUsed).toBeGreaterThan(0);
    },
    30_000,
  );

  it.skipIf(!hasRealKey)(
    'parses a CV into structured data via the real API using the tool-use schema',
    async () => {
      const cvText = [
        'Jane Doe',
        'jane@example.com',
        '',
        'Skills: TypeScript, PostgreSQL, Kubernetes',
        '',
        'Experience:',
        'Senior Backend Engineer, Acme GmbH (01/2020 - present)',
        'Built and scaled APIs serving millions of requests per day.',
      ].join('\n');

      const result = await provider.parseCv(cvText, 'en');
      expect(result.parsed.fullName).toBe('Jane Doe');
      expect(result.parsed.email).toBe('jane@example.com');
      expect(result.parsed.skills.length).toBeGreaterThan(0);
      expect(result.tokensUsed).toBeGreaterThan(0);
    },
    30_000,
  );
});
