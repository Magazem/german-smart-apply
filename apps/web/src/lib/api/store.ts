import type {
  Application,
  ApplicationDraft,
  ApplicationEvent,
  CandidateProfile,
  FollowUpDraft,
  InterviewPrepDraft,
  JobFeedbackType,
  ParsedCvResult,
  RoleGapAnalysis,
} from '@german-smart-apply/shared';

const STORAGE_KEY = 'gsa_mock_db_v1';

export interface MockUser {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string | null;
  tier: 'free' | 'pro';
  // Absent on users created before this field existed (older localStorage
  // payloads) - always read via `user.role ?? 'user'`, never bare.
  role?: 'user' | 'admin';
  createdAt: string;
}

export interface MockSavedSearch {
  id: string;
  userId: string;
  name: string;
  filters: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MockDb {
  users: MockUser[];
  profiles: Record<string, CandidateProfile>;
  parsedCv: Record<string, ParsedCvResult>;
  applications: Application[];
  /** applicationId -> every generated variant, most recent first. */
  applicationDrafts: Record<string, ApplicationDraft[]>;
  /** applicationId -> every generated follow-up email, most recent first. */
  followUpDrafts: Record<string, FollowUpDraft[]>;
  /** applicationId -> every generated interview prep draft, most recent first. */
  interviewPrepDrafts: Record<string, InterviewPrepDraft[]>;
  applicationEvents: ApplicationEvent[];
  /** userId -> jobId -> feedback. Absent/undefined means no feedback recorded. */
  jobFeedback: Record<string, Record<string, JobFeedbackType>>;
  savedSearches: MockSavedSearch[];
  /** userId -> every run analysis, most recent first. Absent on pre-feature localStorage payloads. */
  roleGapAnalyses?: Record<string, RoleGapAnalysis[]>;
  /** Admin-set OpenRouter model override for the mock world. Absent/null means no override. */
  openRouterModelOverride?: string | null;
  sessionUserId: string | null;
}

export function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Not real cryptography — this is a mock data layer with no real secrets. */
export function weakHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return `h${hash}`;
}

export function delay(ms = 180): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function emptyDb(): MockDb {
  return {
    users: [],
    profiles: {},
    parsedCv: {},
    applications: [],
    applicationDrafts: {},
    followUpDrafts: {},
    interviewPrepDrafts: {},
    applicationEvents: [],
    jobFeedback: {},
    savedSearches: [],
    sessionUserId: null,
  };
}

let memoryDb: MockDb | null = null;

function hasStorage(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

export function loadDb(): MockDb {
  if (memoryDb) return memoryDb;
  if (hasStorage()) {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        memoryDb = JSON.parse(raw) as MockDb;
        return memoryDb;
      }
    } catch {
      // fall through to fresh db
    }
  }
  memoryDb = emptyDb();
  return memoryDb;
}

export function saveDb(db: MockDb): void {
  memoryDb = db;
  if (hasStorage()) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch {
      // storage full/unavailable — mock layer degrades to in-memory only
    }
  }
}

export function resetDb(): void {
  memoryDb = emptyDb();
  if (hasStorage()) {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}
