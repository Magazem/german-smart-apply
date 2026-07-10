import { describe, expect, it } from 'vitest';
import type { CandidateProfile, CanonicalJob } from '@german-smart-apply/shared';
import { MockAiProvider } from './mock-provider.js';

const profile: CandidateProfile = {
  id: 'p1',
  userId: 'u1',
  fullName: 'Jane Doe',
  targetRole: 'Backend Engineer',
  targetCountryCode: 'DE',
  preferredLanguage: 'en',
  seniority: 'senior',
  locationPreference: 'hybrid',
  skills: ['TypeScript', 'PostgreSQL', 'Kubernetes'],
  summary: null,
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
};

describe('MockAiProvider', () => {
  const provider = new MockAiProvider();

  it('parses a CV into name, email, and skills', async () => {
    const result = await provider.parseCv(
      'Jane Doe\njane@example.com\nSkills: TypeScript, PostgreSQL',
      'en',
    );
    expect(result.fullName).toBe('Jane Doe');
    expect(result.email).toBe('jane@example.com');
    expect(result.skills).toEqual(['TypeScript', 'PostgreSQL']);
  });

  it('generates a cover letter referencing the job and company', async () => {
    const result = await provider.generateCoverLetter(profile, job, 'en');
    expect(result.text).toContain('senior backend engineer');
    expect(result.text).toContain('acme gmbh');
    expect(result.modelUsed).toBe('mock');
  });

  it('uses German greeting for German-language cover letters', async () => {
    const result = await provider.generateCoverLetter(profile, job, 'de');
    expect(result.text).toContain('Sehr geehrte Damen und Herren');
  });

  it('explains match by referencing overlapping skills', async () => {
    const result = await provider.generateMatchExplanation(profile, job, 'en');
    expect(result.text).toMatch(/TypeScript|PostgreSQL/);
  });

  it('produces a CV variant tailored to the job title and company', async () => {
    const result = await provider.generateCvVariant(profile, job, 'en');
    expect(result.text).toContain('senior backend engineer');
    expect(result.text).toContain('acme gmbh');
  });
});
