import type {
  Application,
  ApplicationDraft,
  ApplicationEvent,
  ApplicationStatus,
  CandidateProfile,
  CvVariantStyle,
  FollowUpDraft,
  InterviewPrepDraft,
  JobFeedbackType,
  JobSearchFilters,
  ParsedCvResult,
  RoleGapAnalysis,
} from '@german-smart-apply/shared';
import type {
  AlertRunSummary,
  AnalyticsSummary,
  ApiClient,
  AuthSession,
  AuthUser,
  CvUploadInput,
  DedupStats,
  JobDetailResult,
  JobSearchResult,
  LoginInput,
  RegisterInput,
  SavedSearch,
  SourceHealth,
  SourceCrawlRun,
  TokenUsageSummary,
} from './types';

const TOKEN_STORAGE_KEY = 'gsa_auth_token';

/**
 * NestJS's ValidationPipe returns `{ message: string | string[], error, statusCode }` on
 * 4xx responses; surface that human-readable message instead of the raw JSON body.
 */
function extractApiErrorMessage(body: string, res: Response): string {
  try {
    const parsed = JSON.parse(body) as { message?: string | string[] };
    if (Array.isArray(parsed.message)) return parsed.message.join(' ');
    if (typeof parsed.message === 'string') return parsed.message;
  } catch {
    // Not a JSON error body - fall through to the raw text below.
  }
  return body || res.statusText || `API error ${res.status}`;
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

function setToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  if (token) window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  else window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}

interface RawAuthResult {
  accessToken: string;
  user: { id: string; email: string };
}

interface RawMeResult {
  id: string;
  email: string;
  subscriptionStatus: 'free' | 'pro' | 'canceled' | 'past_due';
  role: 'user' | 'admin';
  createdAt: string;
  candidateProfile: { fullName: string | null } | null;
}

function toAuthUser(raw: RawMeResult): AuthUser {
  return {
    id: raw.id,
    email: raw.email,
    fullName: raw.candidateProfile?.fullName ?? null,
    tier: raw.subscriptionStatus === 'pro' ? 'pro' : 'free',
    role: raw.role,
    createdAt: raw.createdAt,
  };
}

/**
 * Real HTTP implementation, talking to apps/api.
 */
export class RealApiClient implements ApiClient {
  constructor(private readonly baseUrl: string) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = getToken();
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(extractApiErrorMessage(body, res));
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  auth = {
    register: async (input: RegisterInput): Promise<AuthSession> => {
      const result = await this.request<RawAuthResult>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      setToken(result.accessToken);
      const user = (await this.auth.me()) ?? {
        id: result.user.id,
        email: result.user.email,
        fullName: null,
        tier: 'free' as const,
        role: 'user' as const,
        createdAt: new Date().toISOString(),
      };
      return { user, token: result.accessToken };
    },
    login: async (input: LoginInput): Promise<AuthSession> => {
      const result = await this.request<RawAuthResult>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      setToken(result.accessToken);
      const user = (await this.auth.me()) ?? {
        id: result.user.id,
        email: result.user.email,
        fullName: null,
        tier: 'free' as const,
        role: 'user' as const,
        createdAt: new Date().toISOString(),
      };
      return { user, token: result.accessToken };
    },
    me: async (): Promise<AuthUser | null> => {
      if (!getToken()) return null;
      try {
        const raw = await this.request<RawMeResult>('/auth/me');
        return toAuthUser(raw);
      } catch {
        return null;
      }
    },
    logout: async (): Promise<void> => {
      setToken(null);
    },
  };

  profile = {
    get: async (): Promise<CandidateProfile | null> => {
      try {
        return await this.request<CandidateProfile>('/profile');
      } catch {
        return null;
      }
    },
    update: async (patch: Partial<CandidateProfile>): Promise<CandidateProfile> =>
      this.request<CandidateProfile>('/profile', { method: 'PUT', body: JSON.stringify(patch) }),
  };

  cv = {
    upload: async (input: CvUploadInput): Promise<ParsedCvResult> => {
      const form = new FormData();
      if (input.kind === 'file') {
        form.append('file', input.file);
      } else {
        form.append('file', new Blob([input.text], { type: 'text/plain' }), 'cv.txt');
      }
      const token = getToken();
      const res = await fetch(`${this.baseUrl}/cv/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      });
      if (!res.ok) throw new Error(`CV upload failed: ${res.status}`);
      const body = (await res.json()) as { parsed: ParsedCvResult };
      return body.parsed;
    },
    getLastParsed: async (): Promise<ParsedCvResult | null> => {
      try {
        return await this.request<ParsedCvResult>('/cv/last');
      } catch {
        return null;
      }
    },
  };

  jobs = {
    search: async (filters: JobSearchFilters): Promise<JobSearchResult> => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value == null) continue;
        if (Array.isArray(value)) params.set(key, value.join(','));
        else params.set(key, String(value));
      }
      const raw = await this.request<{
        total: number;
        results: Array<{ job: JobDetailResult['job']; score: JobDetailResult['match'] }>;
      }>(`/jobs/search?${params.toString()}`);
      const matches: JobSearchResult['matches'] = {};
      for (const r of raw.results) {
        if (r.score) matches[r.job.jobId] = r.score;
      }
      return { jobs: raw.results.map((r) => r.job), matches, total: raw.total };
    },
    get: async (id: string): Promise<JobDetailResult | null> => {
      try {
        const raw = await this.request<{
          job: JobDetailResult['job'];
          score: JobDetailResult['match'];
          myFeedback?: JobFeedbackType | null;
        }>(`/jobs/${id}`);
        return { job: raw.job, match: raw.score, myFeedback: raw.myFeedback ?? null };
      } catch {
        return null;
      }
    },
    recordFeedback: async (
      id: string,
      feedback: JobFeedbackType,
    ): Promise<{ feedback: JobFeedbackType | null }> =>
      this.request<{ feedback: JobFeedbackType | null }>(`/jobs/${id}/feedback`, {
        method: 'POST',
        body: JSON.stringify({ feedback }),
      }),
  };

  savedSearches = {
    list: async (): Promise<SavedSearch[]> => this.request<SavedSearch[]>('/saved-searches'),
    create: async (name: string, filters: JobSearchFilters): Promise<SavedSearch> =>
      this.request<SavedSearch>('/saved-searches', {
        method: 'POST',
        body: JSON.stringify({ name, filters }),
      }),
    update: async (
      id: string,
      patch: Partial<Pick<SavedSearch, 'name' | 'filters' | 'isActive'>>,
    ): Promise<SavedSearch> =>
      this.request<SavedSearch>(`/saved-searches/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    remove: async (id: string): Promise<void> => {
      await this.request(`/saved-searches/${id}`, { method: 'DELETE' });
    },
  };

  applications = {
    list: async (): Promise<Application[]> => this.request<Application[]>('/applications'),
    get: async (id: string): Promise<Application | null> => {
      try {
        return await this.request<Application>(`/applications/${id}`);
      } catch {
        return null;
      }
    },
    getDraft: async (id: string): Promise<ApplicationDraft | null> => {
      try {
        return await this.request<ApplicationDraft>(`/applications/${id}/draft`);
      } catch {
        return null;
      }
    },
    listDrafts: async (id: string): Promise<ApplicationDraft[]> =>
      this.request<ApplicationDraft[]>(`/applications/${id}/drafts`),
    create: async (jobId: string): Promise<Application> =>
      this.request<Application>('/applications', { method: 'POST', body: JSON.stringify({ jobId }) }),
    draft: async (applicationId: string, variantStyle?: CvVariantStyle): Promise<ApplicationDraft> =>
      this.request<ApplicationDraft>(`/applications/${applicationId}/draft`, {
        method: 'POST',
        body: JSON.stringify(variantStyle ? { variantStyle } : {}),
      }),
    updateStatus: async (
      applicationId: string,
      status: ApplicationStatus,
      note?: string,
    ): Promise<Application> =>
      this.request<Application>(`/applications/${applicationId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, note }),
      }),
    history: async (applicationId: string): Promise<ApplicationEvent[]> => {
      try {
        return await this.request<ApplicationEvent[]>(`/applications/${applicationId}/events`);
      } catch {
        return [];
      }
    },
    downloadPdf: async (applicationId: string, draftId?: string): Promise<Blob> => {
      const token = getToken();
      const query = draftId ? `?draftId=${encodeURIComponent(draftId)}` : '';
      const res = await fetch(`${this.baseUrl}/applications/${applicationId}/pdf${query}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error(`PDF export failed: ${res.status}`);
      return res.blob();
    },
    generateFollowUp: async (applicationId: string, language?: string): Promise<FollowUpDraft> =>
      this.request<FollowUpDraft>(`/applications/${applicationId}/follow-up`, {
        method: 'POST',
        body: JSON.stringify(language ? { language } : {}),
      }),
    listFollowUps: async (applicationId: string): Promise<FollowUpDraft[]> =>
      this.request<FollowUpDraft[]>(`/applications/${applicationId}/follow-ups`),
    generateInterviewPrep: async (applicationId: string, language?: string): Promise<InterviewPrepDraft> =>
      this.request<InterviewPrepDraft>(`/applications/${applicationId}/interview-prep`, {
        method: 'POST',
        body: JSON.stringify(language ? { language } : {}),
      }),
    listInterviewPreps: async (applicationId: string): Promise<InterviewPrepDraft[]> =>
      this.request<InterviewPrepDraft[]>(`/applications/${applicationId}/interview-preps`),
  };

  usage = {
    summary: async (): Promise<TokenUsageSummary> => this.request<TokenUsageSummary>('/usage'),
  };

  roleGapAnalysis = {
    list: async (): Promise<RoleGapAnalysis[]> =>
      this.request<RoleGapAnalysis[]>('/role-gap-analysis'),
    create: async (targetRole: string, language?: string): Promise<RoleGapAnalysis> =>
      this.request<RoleGapAnalysis>('/role-gap-analysis', {
        method: 'POST',
        body: JSON.stringify(language ? { targetRole, language } : { targetRole }),
      }),
  };

  admin = {
    listSources: async (): Promise<SourceHealth[]> =>
      this.request<SourceHealth[]>('/admin/sources'),
    sourceRuns: async (
      sourceId: string,
    ): Promise<{ source: SourceHealth; runs: SourceCrawlRun[] } | null> => {
      try {
        return await this.request<{ source: SourceHealth; runs: SourceCrawlRun[] }>(
          `/admin/sources/${sourceId}/runs`,
        );
      } catch {
        return null;
      }
    },
    dedupStats: async (): Promise<DedupStats> => this.request<DedupStats>('/admin/dedup-stats'),
    runAlerts: async (): Promise<AlertRunSummary> =>
      this.request<AlertRunSummary>('/admin/alerts/run', { method: 'POST' }),
    analytics: async (): Promise<AnalyticsSummary> => this.request<AnalyticsSummary>('/admin/analytics'),
    getOpenRouterModel: async (): Promise<{ model: string | null }> =>
      this.request<{ model: string | null }>('/admin/settings/openrouter-model'),
    setOpenRouterModel: async (model: string | null): Promise<{ model: string | null }> =>
      this.request<{ model: string | null }>('/admin/settings/openrouter-model', {
        method: 'PUT',
        body: JSON.stringify({ model }),
      }),
  };
}
