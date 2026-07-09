import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../src/prisma/prisma.service.js';

export interface JobFixtureOverrides {
  jobTitle?: string;
  companyName?: string;
  countryCode?: string;
  remoteType?: string;
  seniority?: string;
  techStackTags?: string[];
  salaryMin?: number | null;
  salaryMax?: number | null;
  language?: string;
  postedAt?: Date;
  sourceTrustScore?: number;
  scamRiskScore?: number;
  sourceType?: string;
}

/**
 * Builds a full Source -> RawJob -> CanonicalJob chain so search/detail/
 * application tests have a real canonical job to query, without depending on
 * the (separately-owned) ingestion/normalization workers.
 */
export async function createJobFixture(prisma: PrismaService, overrides: JobFixtureOverrides = {}) {
  const suffix = randomUUID().slice(0, 8);
  const source = await prisma.client.source.create({
    data: {
      sourceType: overrides.sourceType ?? 'greenhouse',
      displayName: `Test Source ${suffix}`,
      countryCode: overrides.countryCode ?? 'DE',
      trustTier: 'high',
    },
  });

  const rawJob = await prisma.client.rawJob.create({
    data: {
      sourceId: source.id,
      originalJobId: `ext-${suffix}`,
      sourceUrl: `https://example.com/jobs/${suffix}`,
      companyNameRaw: overrides.companyName ?? 'Acme GmbH',
      companyNameNormalized: (overrides.companyName ?? 'Acme GmbH').toLowerCase(),
      jobTitleRaw: overrides.jobTitle ?? 'Senior Backend Engineer',
      jobTitleNormalized: (overrides.jobTitle ?? 'Senior Backend Engineer').toLowerCase(),
      jobDescriptionText: 'Build reliable backend systems with TypeScript and Postgres.',
      language: overrides.language ?? 'en',
      locationRaw: 'Berlin',
      locationNormalized: 'Berlin',
      countryCode: overrides.countryCode ?? 'DE',
      remoteType: overrides.remoteType ?? 'hybrid',
      employmentType: 'full_time',
      seniority: overrides.seniority ?? 'senior',
      salaryMin: overrides.salaryMin === undefined ? 60000 : overrides.salaryMin,
      salaryMax: overrides.salaryMax === undefined ? 80000 : overrides.salaryMax,
      salaryCurrency: 'EUR',
      techStackTags: overrides.techStackTags ?? ['typescript', 'node', 'postgres'],
      applyUrl: `https://example.com/apply/${suffix}`,
      postedAt: overrides.postedAt ?? new Date(),
      sourceTrustScore: overrides.sourceTrustScore ?? 0.9,
      scamRiskScore: overrides.scamRiskScore ?? 0.05,
    },
  });

  const canonicalJob = await prisma.client.canonicalJob.create({
    data: {
      rawJobId: rawJob.id,
      companyNameNormalized: rawJob.companyNameNormalized,
      jobTitleNormalized: rawJob.jobTitleNormalized,
      locationNormalized: rawJob.locationNormalized,
      countryCode: rawJob.countryCode,
      remoteType: rawJob.remoteType,
      employmentType: rawJob.employmentType,
      seniority: rawJob.seniority,
      salaryMin: rawJob.salaryMin,
      salaryMax: rawJob.salaryMax,
      salaryCurrency: rawJob.salaryCurrency,
      techStackTags: rawJob.techStackTags,
      language: rawJob.language,
      sourceTrustScore: rawJob.sourceTrustScore,
      scamRiskScore: rawJob.scamRiskScore,
      postedAt: rawJob.postedAt,
      crawledAt: rawJob.crawledAt,
      isVisible: true,
    },
  });

  return { source, rawJob, canonicalJob };
}

/** Deleting the Source cascades RawJob -> CanonicalJob (and dedup tables) per schema.prisma's onDelete: Cascade chain. */
export async function deleteJobFixture(prisma: PrismaService, sourceId: string): Promise<void> {
  await prisma.client.source.delete({ where: { id: sourceId } }).catch(() => undefined);
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@example.com`;
}
