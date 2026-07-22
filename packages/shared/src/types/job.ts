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
  | 'stepstone'
  | 'personio'
  | 'smartrecruiters';

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
  /** 1.0 = canonical/no duplicates merged; lower when near_duplicates.py merged near-dup postings into this one. */
  duplicateConfidence: number;
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

/**
 * Why salaryFit is null - distinguishes "you haven't set a salary target"
 * (actionable by the candidate; salaryTarget* is a pro-only field) from
 * "this job doesn't disclose a salary range" (a fact about the listing, not
 * the candidate) - so the UI can point at the right side of the gap instead
 * of one generic "no data" message.
 */
export type SalaryFitUnavailableReason = 'no_candidate_target' | 'no_job_salary';

export interface JobMatchScore {
  jobId: string;
  totalScore: number;
  titleSimilarity: number;
  skillOverlap: number;
  locationFit: number;
  recencmyBoost: number;
  /**
   * null when there's nothing to compare - no salary target set on the
   * profile (a pro-only field) or no salary range disclosed on the job. When
   * null, this dimension is excluded from totalScore entirely (weight
   * redistributed across the dimensions that were actually measured) rather
   * than assumed neutral - see salaryFitUnavailableReason for why.
   */
  salaryFit: number | null;
  /** Set only when salaryFit is null. */
  salaryFitUnavailableReason?: SalaryFitUnavailableReason;
  languageFit: number;
  sourceTrust: number;
  duplicateConfidence: number;
  riskPenalty: number;
  /**
   * Whether the candidate meets hard constraints (currently: target country)
   * for this job, as opposed to how well it fits their skills/role. Kept
   * separate from the continuous fit dimensions above so a strong semantic
   * match with a hard-constraint mismatch (e.g. a great marketing role in a
   * country the candidate isn't targeting) is legible as two distinct facts,
   * not blended into one number.
   */
  eligible: boolean;
  explanation?: string;
}
