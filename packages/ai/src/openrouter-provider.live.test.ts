import { describe, expect, it } from 'vitest';
import { marketDe } from '@german-smart-apply/market-de';
import type { CandidateProfile, CanonicalJob } from '@german-smart-apply/shared';
import { OpenRouterAiProvider } from './openrouter-provider.js';

/**
 * Live integration test against the real OpenRouter API.
 *
 * This sandbox has no OPENROUTER_API_KEY, so every test below is SKIPPED
 * here (not failed) via `it.skipIf`. It exists so that once a real key is
 * set, running `OPENROUTER_API_KEY=sk-or-... pnpm test` gives real
 * end-to-end coverage of prompt building + response parsing against a live
 * free-tier model - the actual "does real behavior/functionality work"
 * check that a fake-injected-client unit test cannot provide.
 *
 * parseCv is checked first and alone: it's the most complex schema (nested
 * arrays of objects) and the highest-risk assumption - if a chosen free
 * model can't produce that reliably, it's not worth mechanically extending
 * this file to the other 6 AiProvider methods.
 *
 * TODO(whoever has a key): run this at least once before relying on
 * OpenRouterAiProvider for anything beyond a wiring smoke test. Good output
 * looks like: a non-empty parsed.fullName/email/skills, tokensUsed > 0, and
 * modelUsed reflecting the actual model OpenRouter routed to (may differ
 * from the requested slug if using an auto-router alias).
 */
const hasRealKey = Boolean(process.env.OPENROUTER_API_KEY);

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
  duplicateConfidence: 1,
};

describe('OpenRouterAiProvider (live integration)', () => {
  const provider = new OpenRouterAiProvider(marketDe, { model: process.env.OPENROUTER_MODEL });

  it.skipIf(!hasRealKey)(
    'parses a CV into structured data via the real API',
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

  it.skipIf(!hasRealKey)(
    'generates a real match explanation and reports real token usage',
    async () => {
      const result = await provider.generateMatchExplanation(profile, job, 'en');
      expect(result.text.length).toBeGreaterThan(0);
      expect(result.tokensUsed).toBeGreaterThan(0);
    },
    30_000,
  );
});
