import type {
  Application,
  ApplicationDraft,
  ApplicationEvent,
  CandidateProfile,
  ParsedCvResult,
} from '@german-smart-apply/shared';

const STORAGE_KEY = 'gsa_mock_db_v1';

export interface MockUser {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string | null;
  tier: 'free' | 'pro';
  createdAt: string;
}

export interface MockDb {
  users: MockUser[];
  profiles: Record<string, CandidateProfile>;
  parsedCv: Record<string, ParsedCvResult>;
  applications: Application[];
  applicationDrafts: Record<string, ApplicationDraft>;
  applicationEvents: ApplicationEvent[];
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
    applicationEvents: [],
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
