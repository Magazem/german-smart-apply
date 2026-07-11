export type RemoteType = 'onsite' | 'hybrid' | 'remote';

/**
 * A user's explicit thumbs up/down on a job, distinct from the passive
 * 'view'/'share' JobInteraction rows recorded automatically. Feeds
 * RankingService's interactionBias — see apps/api/src/jobs/jobs.service.ts.
 */
export const JOB_FEEDBACK_TYPES = ['like', 'skip'] as const;
export type JobFeedbackType = (typeof JOB_FEEDBACK_TYPES)[number];

export type EmploymentType =
  | 'full_time'
  | 'part_time'
  | 'contract'
  | 'internship'
  | 'working_student'
  | 'freelance';

export type Seniority = 'intern' | 'junior' | 'mid' | 'senior' | 'lead' | 'principal';

export type SourceType =
  | 'greenhouse'
  | 'lever'
  | 'ashby'
  | 'teamtailor'
  | 'successfactors'
  | 'arbeitsagentur'
  | 'stepstone';

/**
 * Canonical job schema — the single shape every source adapter's raw payload
 * is normalized into before search, matching, or dedup ever see it.
 * Mirrors the "Canonical schema fields" list in plan.md Normalization Layer.
 */
export interface CanonicalJob {
  jobId: string;
  sourceId: string;
  sourceType: SourceType;
  sourceUrl: string;
  originalJobId: string;

  companyNameRaw: string;
  companyNameNormalized: string;

  jobTitleRaw: string;
  jobTitleNormalized: string;

  jobDescriptionHtml: string | null;
  jobDescriptionText: string;

  language: string;
  locationRaw: string;
  locationNormalized: string;
  countryCode: string;

  remoteType: RemoteType;
  employmentType: EmploymentType;
  seniority: Seniority | null;

  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;

  techStackTags: string[];
  applyUrl: string;

  postedAt: string | null;
  crawledAt: string;

  sourceTrustScore: number;
  scamRiskScore: number;
}

export interface RawJobPayload {
  sourceId: string;
  sourceType: SourceType;
  originalJobId: string;
  fetchedAt: string;
  payload: Record<string, unknown>;
}

export interface JobSearchFilters {
  query?: string;
  title?: string;
  stack?: string[];
  locationCountryCode?: string;
  remoteType?: RemoteType[];
  language?: string;
  salaryMin?: number;
  seniority?: Seniority[];
  sourceType?: SourceType[];
  limit?: number;
  offset?: number;
}

export interface JobMatchScore {
  jobId: string;
  totalScore: number;
  titleSimilarity: number;
  skillOverlap: number;
  locationFit: number;
  recencmyBoost: number;
  salaryFit: number;
  languageFit: number;
  sourceTrust: number;
  duplicateConfidence: number;
  riskPenalty: number;
  explanation?: string;
}
