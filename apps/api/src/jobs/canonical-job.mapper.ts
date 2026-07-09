import type {
  CanonicalJob as PrismaCanonicalJob,
  RawJob as PrismaRawJob,
  Source as PrismaSource,
} from '@german-smart-apply/db';
import type {
  CanonicalJob,
  EmploymentType,
  RemoteType,
  Seniority,
  SourceType,
} from '@german-smart-apply/shared';

export type CanonicalJobWithRaw = PrismaCanonicalJob & {
  rawJob: PrismaRawJob & { source: PrismaSource };
};

/**
 * Maps the persisted (denormalized-for-dedup) CanonicalJob + its originating
 * RawJob/Source rows onto the shared `CanonicalJob` DTO shape that the AI
 * provider and ranking logic are written against. The DB deliberately keeps
 * "raw" fields (company/title-as-written, description, apply URL, source
 * type) only on RawJob to avoid duplicating them for every canonical pick.
 */
export function toSharedCanonicalJob(record: CanonicalJobWithRaw): CanonicalJob {
  const { rawJob } = record;
  return {
    jobId: record.id,
    sourceId: rawJob.sourceId,
    sourceType: rawJob.source.sourceType as SourceType,
    sourceUrl: rawJob.sourceUrl,
    originalJobId: rawJob.originalJobId,

    companyNameRaw: rawJob.companyNameRaw,
    companyNameNormalized: record.companyNameNormalized,

    jobTitleRaw: rawJob.jobTitleRaw,
    jobTitleNormalized: record.jobTitleNormalized,

    jobDescriptionHtml: rawJob.jobDescriptionHtml,
    jobDescriptionText: rawJob.jobDescriptionText,

    language: record.language,
    locationRaw: rawJob.locationRaw,
    locationNormalized: record.locationNormalized,
    countryCode: record.countryCode,

    remoteType: record.remoteType as RemoteType,
    employmentType: record.employmentType as EmploymentType,
    seniority: (record.seniority as Seniority | null) ?? null,

    salaryMin: record.salaryMin,
    salaryMax: record.salaryMax,
    salaryCurrency: record.salaryCurrency,

    techStackTags: record.techStackTags,
    applyUrl: rawJob.applyUrl,

    postedAt: record.postedAt ? record.postedAt.toISOString() : null,
    crawledAt: record.crawledAt.toISOString(),

    sourceTrustScore: record.sourceTrustScore,
    scamRiskScore: record.scamRiskScore,
  };
}
