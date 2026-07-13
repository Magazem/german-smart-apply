import type {
  CandidateProfile,
  CanonicalJob,
  ParsedCvEducation,
  ParsedCvExperience,
  ParsedCvResult,
} from '@german-smart-apply/shared';
import { AiProviderError } from './errors.js';
import type { RoleGapAnalysisInput } from './types.js';

export function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => vars[key] ?? '');
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asStringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

export function toParsedCvExperience(value: unknown): ParsedCvExperience[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((item) => ({
    title: typeof item.title === 'string' ? item.title : '',
    company: typeof item.company === 'string' ? item.company : '',
    startDate: asStringOrNull(item.startDate),
    endDate: asStringOrNull(item.endDate),
    description: typeof item.description === 'string' ? item.description : '',
  }));
}

export function toParsedCvEducation(value: unknown): ParsedCvEducation[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((item) => ({
    degree: typeof item.degree === 'string' ? item.degree : '',
    institution: typeof item.institution === 'string' ? item.institution : '',
    startYear: typeof item.startYear === 'number' ? item.startYear : null,
    endYear: typeof item.endYear === 'number' ? item.endYear : null,
  }));
}

export function parseParsedCvInput(input: unknown, context: string): ParsedCvResult {
  if (!isRecord(input)) {
    throw new AiProviderError(`${context}: tool input was not a JSON object`, 'malformed_response');
  }
  if (typeof input.summary !== 'string') {
    throw new AiProviderError(
      `${context}: tool input is missing the required "summary" string field`,
      'malformed_response',
    );
  }
  return {
    fullName: asStringOrNull(input.fullName),
    email: asStringOrNull(input.email),
    phone: asStringOrNull(input.phone),
    summary: input.summary,
    skills: asStringArray(input.skills),
    experience: toParsedCvExperience(input.experience),
    education: toParsedCvEducation(input.education),
    languages: asStringArray(input.languages),
    suggestions: asStringArray(input.suggestions),
  };
}

function formatExperienceEntry(exp: CandidateProfile['experience'][number]): string {
  const dates = `${exp.startDate ?? '?'} - ${exp.endDate ?? 'present'}`;
  return `- ${exp.title} at ${exp.company} (${dates}): ${exp.description}`;
}

function formatEducationEntry(edu: CandidateProfile['education'][number]): string {
  const years = edu.startYear || edu.endYear ? ` (${edu.startYear ?? '?'} - ${edu.endYear ?? '?'})` : '';
  return `- ${edu.degree}, ${edu.institution}${years}`;
}

/**
 * Every generation call (CV variant, cover letter, interview prep, match
 * explanation) reads the candidate exclusively through this function - it
 * used to only surface targetRole/seniority/locationPreference/skills/summary,
 * so no prompt ever saw the candidate's actual jobs, education, contact
 * info, or spoken languages no matter how good the model or the rest of the
 * prompt was. Now mirrors everything CV parsing actually extracts.
 */
export function formatProfileForPrompt(profile: CandidateProfile): string {
  const lines = [
    `Target role: ${profile.targetRole}`,
    `Seniority: ${profile.seniority}`,
    `Location preference: ${profile.locationPreference}`,
    `Skills: ${profile.skills.join(', ') || 'none listed'}`,
  ];
  if (profile.languages.length > 0) lines.push(`Languages: ${profile.languages.join(', ')}`);
  if (profile.summary) lines.push(`Current summary: ${profile.summary}`);
  if (profile.experience.length > 0) {
    lines.push(`Work experience:\n${profile.experience.map(formatExperienceEntry).join('\n')}`);
  }
  if (profile.education.length > 0) {
    lines.push(`Education:\n${profile.education.map(formatEducationEntry).join('\n')}`);
  }
  const contact = [profile.email, profile.phone].filter(Boolean).join(' | ');
  if (contact) lines.push(`Contact: ${contact}`);
  if (profile.fullName) lines.unshift(`Candidate name: ${profile.fullName}`);
  return lines.join('\n');
}

export function formatJobForPrompt(job: CanonicalJob): string {
  return [
    `Job title: ${job.jobTitleNormalized}`,
    `Company: ${job.companyNameNormalized}`,
    `Location: ${job.locationNormalized} (${job.remoteType})`,
    `Seniority: ${job.seniority ?? 'unspecified'}`,
    `Tech stack: ${job.techStackTags.join(', ') || 'not specified'}`,
    `Description: ${job.jobDescriptionText}`,
  ].join('\n');
}

/**
 * Formats the pre-aggregated role-gap-analysis input: a target role, a
 * deterministic tag-frequency count computed server-side across every
 * matching posting (not just the sample), and a small representative sample
 * of full postings. Keeps token cost bounded without the model ever needing
 * to see all matching postings itself.
 */
export function formatRoleGapAnalysisInput(input: RoleGapAnalysisInput): string {
  const tagLines = Object.entries(input.tagFrequency)
    .sort(([, a], [, b]) => b - a)
    .map(([tag, count]) => `${tag} (${count})`)
    .join(', ');

  const sampleLines = input.sampleJobs
    .map((job, i) => `--- Sample posting ${i + 1} ---\n${formatJobForPrompt(job)}`)
    .join('\n\n');

  return [
    `Target role: ${input.targetRole}`,
    `Skill/tag frequency across ${input.sampleJobs.length > 0 ? 'all matching postings' : 'no matching postings'}: ${
      tagLines || 'none available'
    }`,
    sampleLines ? `Representative sample postings:\n\n${sampleLines}` : 'No sample postings available.',
  ].join('\n\n');
}
