import type {
  Application,
  ApplicationDraft,
  ApplicationEvent,
  ApplicationStatus,
  CandidateProfile,
  CanonicalJob,
  CvVariantStyle,
  FollowUpDraft,
  InterviewPrepDraft,
  JobFeedbackType,
  JobMatchScore,
  JobSearchFilters,
  ParsedCvResult,
} from '@german-smart-apply/shared';

/**
 * Frontend-local view types. These are NOT part of the packages/shared
 * contract (view-specific shapes only) — kept here per the instruction to
 * add view-specific types locally rather than editing packages/shared.
 */
export interface AuthUser {
  id: string;
  email: string;
  fullName: string | null;
  tier: 'free' | 'pro';
  // No self-serve path to become 'admin' - promoted via a manual DB update,
  // same as there's no self-serve path to Pro without going through Stripe.
  role: 'user' | 'admin';
  createdAt: string;
}

export interface AuthSession {
  user: AuthUser;
  token: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  fullName?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface JobSearchResult {
  jobs: CanonicalJob[];
  matches: Record<string, JobMatchScore>;
  total: number;
}

export interface JobDetailResult {
  job: CanonicalJob;
  match: JobMatchScore | null;
  myFeedback?: JobFeedbackType | null;
}

export type CvUploadInput = { kind: 'file'; file: File } | { kind: 'text'; text: string };

export interface TokenUsageSummary {
  totalTokens: number;
  byFeature: Array<{ feature: string; tokensUsed: number; callCount: number }>;
}

export interface SourceCrawlRun {
  id: string;
  status: 'running' | 'success' | 'partial_failure' | 'failure';
  startedAt: string;
  finishedAt: string | null;
  jobsFetched: number;
  jobsNew: number;
  jobsUpdated: number;
  errorLog: string | null;
  retryCount: number;
}

export interface SourceHealth {
  id: string;
  sourceType: string;
  displayName: string;
  countryCode: string;
  trustTier: 'low' | 'medium' | 'high';
  isActive: boolean;
  crawlFrequencyMinutes: number;
  lastRun: SourceCrawlRun | null;
  recentRunCount: number;
  // null (not 0) when no run has completed yet for this source.
  successRate: number | null;
}

export interface SavedSearch {
  id: string;
  name: string;
  filters: JobSearchFilters;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DedupStats {
  totalRawJobs: number;
  totalCanonicalJobs: number;
  visibleCanonicalJobs: number;
  hiddenByDuplication: number;
  totalDuplicateClusters: number;
  exactDuplicateClusters: number;
  nearDuplicateClusters: number;
  totalDuplicateClusterMembers: number;
}

export interface AlertRunSummary {
  searchesChecked: number;
  emailsSent: number;
  totalJobsMatched: number;
}

export interface AnalyticsSummary {
  userCounts: { total: number; free: number; pro: number; canceled: number; past_due: number };
  applicationFunnel: Record<ApplicationStatus, number>;
  tokenUsage: TokenUsageSummary;
  signupsLast30Days: number;
}

/**
 * The single seam between every page/component and "the backend". Both the
 * mock (in-memory + localStorage, used today) and real (fetch against
 * NEXT_PUBLIC_API_URL, wired in once apps/api ships) implementations satisfy
 * this same interface, mirroring the contract described in the build brief:
 *   POST /auth/register, POST /auth/login, GET /auth/me
 *   GET/PUT /profile
 *   POST /cv/upload
 *   GET /jobs/search, GET /jobs/:id
 *   POST /applications, POST /applications/:id/draft,
 *   PATCH /applications/:id/status, GET /applications
 */
export interface ApiClient {
  auth: {
    register(input: RegisterInput): Promise<AuthSession>;
    login(input: LoginInput): Promise<AuthSession>;
    me(): Promise<AuthUser | null>;
    logout(): Promise<void>;
  };
  profile: {
    get(): Promise<CandidateProfile | null>;
    update(patch: Partial<CandidateProfile>): Promise<CandidateProfile>;
  };
  cv: {
    upload(input: CvUploadInput): Promise<ParsedCvResult>;
    getLastParsed(): Promise<ParsedCvResult | null>;
  };
  jobs: {
    search(filters: JobSearchFilters): Promise<JobSearchResult>;
    get(id: string): Promise<JobDetailResult | null>;
    /** Toggles like/skip: re-sending the currently-active value clears it (feedback: null). */
    recordFeedback(id: string, feedback: JobFeedbackType): Promise<{ feedback: JobFeedbackType | null }>;
  };
  savedSearches: {
    list(): Promise<SavedSearch[]>;
    create(name: string, filters: JobSearchFilters): Promise<SavedSearch>;
    update(id: string, patch: Partial<Pick<SavedSearch, 'name' | 'filters' | 'isActive'>>): Promise<SavedSearch>;
    remove(id: string): Promise<void>;
  };
  applications: {
    list(): Promise<Application[]>;
    get(id: string): Promise<Application | null>;
    getDraft(id: string): Promise<ApplicationDraft | null>;
    /** Every generated variant for this application, most recent first. */
    listDrafts(id: string): Promise<ApplicationDraft[]>;
    create(jobId: string): Promise<Application>;
    /** variantStyle defaults to 'standard' (free); 'concise'/'leadership' require Pro. */
    draft(applicationId: string, variantStyle?: CvVariantStyle): Promise<ApplicationDraft>;
    updateStatus(
      applicationId: string,
      status: ApplicationStatus,
      note?: string,
    ): Promise<Application>;
    /**
     * Not part of the minimal contract in the build brief — an additive
     * convenience so the UI can render a visible audit trail of status
     * transitions (supports the "approval-first, never hidden" principle).
     * RealApiClient maps this to a plausible future endpoint; adjust once
     * apps/api defines the real one.
     */
    history(applicationId: string): Promise<ApplicationEvent[]>;
    /** Renders a draft's CV + cover letter + job details as a PDF. Defaults to the latest draft. */
    downloadPdf(applicationId: string, draftId?: string): Promise<Blob>;
    /**
     * Drafts a follow-up email for the candidate to review and send
     * themselves - only valid once the application is "applied"/"interview".
     * Never sends anything on the candidate's behalf.
     */
    generateFollowUp(applicationId: string, language?: string): Promise<FollowUpDraft>;
    /** Every generated follow-up email for this application, most recent first. */
    listFollowUps(applicationId: string): Promise<FollowUpDraft[]>;
    /**
     * Generates likely interview questions and talking points for this
     * application's job. Purely informational - no status gate, unlike
     * follow-ups, since there's no "sent on your behalf" concern.
     */
    generateInterviewPrep(applicationId: string, language?: string): Promise<InterviewPrepDraft>;
    /** Every generated interview prep draft for this application, most recent first. */
    listInterviewPreps(applicationId: string): Promise<InterviewPrepDraft[]>;
  };
  usage: {
    summary(): Promise<TokenUsageSummary>;
  };
  admin: {
    /** Throws/rejects for a non-admin caller — both clients enforce this, not just the UI. */
    listSources(): Promise<SourceHealth[]>;
    sourceRuns(sourceId: string): Promise<{ source: SourceHealth; runs: SourceCrawlRun[] } | null>;
    dedupStats(): Promise<DedupStats>;
    /** Manually-invokable only — there is no standing scheduler. */
    runAlerts(): Promise<AlertRunSummary>;
    analytics(): Promise<AnalyticsSummary>;
  };
}
