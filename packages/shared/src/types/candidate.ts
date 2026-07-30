/**
 * How far the candidate will move for a job. Collected alongside homeCity/
 * acceptableCities so a wrong-city posting can be read as either a hard
 * constraint or a soft cost - see market-de's cityFit().
 */
export const RELOCATION_WILLINGNESS = ['no', 'within_country', 'within_eu', 'anywhere'] as const;
export type RelocationWillingness = (typeof RELOCATION_WILLINGNESS)[number];

/**
 * Placeholder written into `targetRole` when a CandidateProfile row has to be
 * created before the user has answered the onboarding questions - CV-parse
 * prefill creates the row first, and `targetRole` is NOT NULL with no DB
 * default. Exported (rather than being a bare literal in two services) because
 * the frontend has to recognize it: see hasCompletedOnboarding().
 */
export const TARGET_ROLE_UNSET = 'Not specified yet';

/**
 * Whether this profile has been through the onboarding questions step.
 *
 * The frontend used to answer this with a truthiness check on `targetRole`,
 * which only ever worked against the mock client - the mock creates profiles
 * with `targetRole: ''`, but the real API always writes a non-empty value
 * (either the CV's most recent job title, or TARGET_ROLE_UNSET). So a real user
 * who uploaded a CV and then abandoned the questions step was treated as fully
 * onboarded: login routed them to /dashboard, the "finish onboarding" CTA never
 * rendered, and their jobs were ranked against the literal string
 * "Not specified yet" with no route back into the flow.
 *
 * Takes the whole profile (not just the role string) so the notion of "done"
 * can grow to cover more answers without changing any call site. Declared as a
 * type predicate so a true result also narrows away null/undefined - callers
 * generally want the profile itself immediately afterwards.
 */
export function hasCompletedOnboarding<T extends Pick<CandidateProfile, 'targetRole'>>(
  profile: T | null | undefined,
): profile is T {
  const role = profile?.targetRole?.trim();
  return Boolean(role) && role !== TARGET_ROLE_UNSET;
}

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
