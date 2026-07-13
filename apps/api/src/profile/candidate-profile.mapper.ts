import type { CandidateProfile as PrismaCandidateProfile } from '@german-smart-apply/db';
import type { CandidateProfile, ParsedCvEducation, ParsedCvExperience } from '@german-smart-apply/shared';

/** Prisma's `Json` columns come back as `unknown` - narrow defensively rather than trusting the cast, in case a row predates this column's validation. */
function asExperienceArray(value: unknown): ParsedCvExperience[] {
  return Array.isArray(value) ? (value as ParsedCvExperience[]) : [];
}

function asEducationArray(value: unknown): ParsedCvEducation[] {
  return Array.isArray(value) ? (value as ParsedCvEducation[]) : [];
}

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
    email: record.email,
    phone: record.phone,
    targetRole: record.targetRole,
    targetCountryCode: record.targetCountryCode,
    preferredLanguage: record.preferredLanguage,
    seniority: record.seniority,
    locationPreference: record.locationPreference as CandidateProfile['locationPreference'],
    skills: record.skills,
    summary: record.summary,
    experience: asExperienceArray(record.experience),
    education: asEducationArray(record.education),
    languages: record.languages,
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
