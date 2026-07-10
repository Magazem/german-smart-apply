import type {
  Application,
  ApplicationDraft,
  ApplicationEvent,
  ApplicationStatus,
  CandidateProfile,
  CanonicalJob,
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
}

export type CvUploadInput = { kind: 'file'; file: File } | { kind: 'text'; text: string };

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
  };
  applications: {
    list(): Promise<Application[]>;
    get(id: string): Promise<Application | null>;
    getDraft(id: string): Promise<ApplicationDraft | null>;
    create(jobId: string): Promise<Application>;
    draft(applicationId: string): Promise<ApplicationDraft>;
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
  };
}
