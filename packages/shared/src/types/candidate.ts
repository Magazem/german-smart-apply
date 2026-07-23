/**
 * How far the candidate will move for a job. Collected alongside homeCity/
 * acceptableCities so a wrong-city posting can be read as either a hard
 * constraint or a soft cost - see market-de's cityFit().
 */
export const RELOCATION_WILLINGNESS = ['no', 'within_country', 'within_eu', 'anywhere'] as const;
export type RelocationWillingness = (typeof RELOCATION_WILLINGNESS)[number];

export interface CandidateProfile {
  id: string;
  userId: string;
  fullName: string | null;
  // Contact info + full work history/education, same shapes as ParsedCvResult
  // below — CV parsing writes straight into these, no lossy remapping. Added
  // alongside experience/education/languages because none of it previously
  // survived from CV parse into the profile the AI layer actually prompts
  // from (formatProfileForPrompt in packages/ai only ever saw targetRole/
  // seniority/locationPreference/skills/summary) - tailored CVs, cover
  // letters, and interview prep were being generated from a flat skill list
  // and a one-paragraph summary, never the candidate's actual jobs.
  email: string | null;
  phone: string | null;
  targetRole: string;
  targetCountryCode: string;
  preferredLanguage: string;
  seniority: string;
  locationPreference: 'onsite' | 'hybrid' | 'remote' | 'any';
  skills: string[];
  summary: string | null;
  experience: ParsedCvExperience[];
  education: ParsedCvEducation[];
  languages: string[];
  salaryTargetMin: number | null;
  salaryTargetMax: number | null;
  workAuthorization: string | null;
  companyBlacklist: string[];
  // Where the candidate actually is and where they'd work, as distinct from
  // locationPreference (which is only a work MODE - onsite/hybrid/remote).
  // Without these, ranking could tell that a job was in the wrong country but
  // treated every city within the target country as interchangeable, so an
  // onsite Munich role scored identically to an onsite Berlin one for a
  // Berlin candidate. Null/empty on every profile created before these
  // existed, and city scoring stays dormant in that case rather than
  // penalizing an unanswered question.
  homeCity: string | null;
  acceptableCities: string[];
  relocationWillingness: RelocationWillingness | null;
  commutePreferenceKm: number | null;
  portfolioLinks: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ParsedCvResult {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  summary: string;
  skills: string[];
  experience: ParsedCvExperience[];
  education: ParsedCvEducation[];
  languages: string[];
  suggestions: string[];
}

export interface ParsedCvExperience {
  title: string;
  company: string;
  startDate: string | null;
  endDate: string | null;
  description: string;
}

export interface ParsedCvEducation {
  degree: string;
  institution: string;
  startYear: number | null;
  endYear: number | null;
}
