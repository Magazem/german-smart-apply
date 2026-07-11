import type {
  Application,
  ApplicationDraft,
  ApplicationEvent,
  ApplicationStatus,
  CandidateProfile,
  JobFeedbackType,
  JobSearchFilters,
  ParsedCvResult,
} from '@german-smart-apply/shared';
import type {
  ApiClient,
  AuthSession,
  AuthUser,
  CvUploadInput,
  JobDetailResult,
  JobSearchResult,
  LoginInput,
  RegisterInput,
  TokenUsageSummary,
} from './types';

const TOKEN_STORAGE_KEY = 'gsa_auth_token';

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
  createdAt: string;
  candidateProfile: { fullName: string | null } | null;
}

function toAuthUser(raw: RawMeResult): AuthUser {
  return {
    id: raw.id,
    email: raw.email,
    fullName: raw.candidateProfile?.fullName ?? null,
    tier: raw.subscriptionStatus === 'pro' ? 'pro' : 'free',
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
      throw new Error(`API error ${res.status}: ${body || res.statusText}`);
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
    create: async (jobId: string): Promise<Application> =>
      this.request<Application>('/applications', { method: 'POST', body: JSON.stringify({ jobId }) }),
    draft: async (applicationId: string): Promise<ApplicationDraft> =>
      this.request<ApplicationDraft>(`/applications/${applicationId}/draft`, { method: 'POST' }),
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
  };

  usage = {
    summary: async (): Promise<TokenUsageSummary> => this.request<TokenUsageSummary>('/usage'),
  };
}
