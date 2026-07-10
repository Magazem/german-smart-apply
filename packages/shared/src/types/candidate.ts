export interface CandidateProfile {
  id: string;
  userId: string;
  fullName: string | null;
  targetRole: string;
  targetCountryCode: string;
  preferredLanguage: string;
  seniority: string;
  locationPreference: 'onsite' | 'hybrid' | 'remote' | 'any';
  skills: string[];
  summary: string | null;
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
