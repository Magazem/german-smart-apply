import type {
  CandidateProfile,
  CanonicalJob,
  ParsedCvEducation,
  ParsedCvExperience,
  ParsedCvResult,
} from '@german-smart-apply/shared';
import { AiProviderError } from './errors.js';

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

export function formatProfileForPrompt(profile: CandidateProfile): string {
  const lines = [
    `Target role: ${profile.targetRole}`,
    `Seniority: ${profile.seniority}`,
    `Location preference: ${profile.locationPreference}`,
    `Skills: ${profile.skills.join(', ') || 'none listed'}`,
  ];
  if (profile.summary) lines.push(`Current summary: ${profile.summary}`);
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
