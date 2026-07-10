import type { CandidateProfile as PrismaCandidateProfile } from '@german-smart-apply/db';
import type { CandidateProfile } from '@german-smart-apply/shared';

/**
 * Maps the Prisma `CandidateProfile` row (Date timestamps) onto the shared
 * `CandidateProfile` DTO (string timestamps) that the AI provider and
 * ranking logic are written against.
 */
export function toSharedCandidateProfile(record: PrismaCandidateProfile): CandidateProfile {
  return {
    id: record.id,
    userId: record.userId,
    fullName: record.fullName,
    targetRole: record.targetRole,
    targetCountryCode: record.targetCountryCode,
    preferredLanguage: record.preferredLanguage,
    seniority: record.seniority,
    locationPreference: record.locationPreference as CandidateProfile['locationPreference'],
    skills: record.skills,
    summary: record.summary,
    salaryTargetMin: record.salaryTargetMin,
    salaryTargetMax: record.salaryTargetMax,
    workAuthorization: record.workAuthorization,
    companyBlacklist: record.companyBlacklist,
    commutePreferenceKm: record.commutePreferenceKm,
    portfolioLinks: record.portfolioLinks,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
