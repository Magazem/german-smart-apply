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
