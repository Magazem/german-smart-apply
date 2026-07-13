import { describe, expect, it } from 'vitest';
import type { CandidateProfile, CanonicalJob } from '@german-smart-apply/shared';
import { MockAiProvider } from './mock-provider.js';
import type { RoleGapAnalysisInput } from './types.js';

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
    expect(result.parsed.fullName).toBe('Jane Doe');
    expect(result.parsed.email).toBe('jane@example.com');
    expect(result.parsed.skills).toEqual(['TypeScript', 'PostgreSQL']);
    expect(result.modelUsed).toBe('mock');
    expect(result.tokensUsed).toBe(0);
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

  it('defaults to the standard CV variant when no style is given', async () => {
    const result = await provider.generateCvVariant(profile, job, 'en');
    expect(result.text).not.toContain('concise variant');
    expect(result.text).not.toContain('leadership variant');
  });

  it('produces a visibly different CV variant per style', async () => {
    const concise = await provider.generateCvVariant(profile, job, 'en', 'concise');
    const leadership = await provider.generateCvVariant(profile, job, 'en', 'leadership');
    expect(concise.text).toContain('concise variant');
    expect(leadership.text).toContain('leadership variant');
    expect(concise.text).not.toBe(leadership.text);
  });

  it('produces a visibly different cover letter per style', async () => {
    const concise = await provider.generateCoverLetter(profile, job, 'en', 'concise');
    const leadership = await provider.generateCoverLetter(profile, job, 'en', 'leadership');
    expect(concise.text).toContain('concise variant');
    expect(leadership.text).toContain('leadership variant');
  });

  it('drafts a follow-up email referencing the job, company, and days since applying', async () => {
    const result = await provider.generateFollowUpEmail(profile, job, 'en', 14);
    expect(result.subject).toContain('senior backend engineer');
    expect(result.body).toContain('acme gmbh');
    expect(result.body).toContain('14');
    expect(result.modelUsed).toBe('mock');
    expect(result.tokensUsed).toBe(0);
  });

  it('uses German greeting for German-language follow-up emails', async () => {
    const result = await provider.generateFollowUpEmail(profile, job, 'de', 7);
    expect(result.body).toContain('Sehr geehrte Damen und Herren');
  });

  it('generates interview prep questions and talking points referencing overlapping skills', async () => {
    const result = await provider.generateInterviewPrep(profile, job, 'en');
    expect(result.questions.length).toBeGreaterThan(0);
    expect(result.talkingPoints.length).toBeGreaterThan(0);
    expect(result.questions.some((q) => q.includes('senior backend engineer'))).toBe(true);
    expect(result.talkingPoints.some((t) => t.includes('TypeScript') || t.includes('PostgreSQL'))).toBe(true);
    expect(result.modelUsed).toBe('mock');
    expect(result.tokensUsed).toBe(0);
  });

  it('falls back to target role when there is no skill overlap', async () => {
    const noOverlapJob: CanonicalJob = { ...job, techStackTags: ['Rust', 'Go'] };
    const result = await provider.generateInterviewPrep(profile, noOverlapJob, 'en');
    expect(result.talkingPoints[0]).toContain('Backend Engineer');
  });

  it('splits tag frequency into matching and missing skills relative to the profile', async () => {
    const input: RoleGapAnalysisInput = {
      targetRole: 'Backend Engineer',
      sampleJobs: [job],
      tagFrequency: { TypeScript: 5, PostgreSQL: 4, Kubernetes: 3, Rust: 2, Go: 1 },
    };
    const result = await provider.generateRoleGapAnalysis(profile, input, 'en');
    expect(result.matchingSkills).toEqual(['TypeScript', 'PostgreSQL', 'Kubernetes']);
    expect(result.missingSkills).toEqual(['Rust', 'Go']);
    expect(result.suggestedLearningTopics.length).toBeGreaterThan(0);
    expect(result.estimatedReadinessScore).toBeGreaterThan(0);
    expect(result.estimatedReadinessScore).toBeLessThanOrEqual(100);
    expect(result.summary).toContain('Backend Engineer');
    expect(result.modelUsed).toBe('mock');
    expect(result.tokensUsed).toBe(0);
  });

  it('scores full readiness when every requested skill is already matched', async () => {
    const input: RoleGapAnalysisInput = {
      targetRole: 'Backend Engineer',
      sampleJobs: [job],
      tagFrequency: { TypeScript: 5, PostgreSQL: 4 },
    };
    const result = await provider.generateRoleGapAnalysis(profile, input, 'en');
    expect(result.missingSkills).toEqual([]);
    expect(result.estimatedReadinessScore).toBe(100);
  });
});
