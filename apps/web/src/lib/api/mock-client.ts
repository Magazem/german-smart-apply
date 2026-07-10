import { MockAiProvider } from '@german-smart-apply/ai/mock';
import {
  canTransition,
  type Application,
  type ApplicationDraft,
  type ApplicationEvent,
  type ApplicationStatus,
  type CandidateProfile,
  type JobSearchFilters,
} from '@german-smart-apply/shared';
import { JOB_FIXTURES } from './fixtures';
import { computeMatchScore } from './scoring';
import { ensureDemoSeed } from './seed';
import { delay, loadDb, nowIso, saveDb, uid, weakHash, type MockDb, type MockUser } from './store';
import type {
  ApiClient,
  AuthSession,
  AuthUser,
  CvUploadInput,
  JobDetailResult,
  JobSearchResult,
  LoginInput,
  RegisterInput,
} from './types';

const aiProvider = new MockAiProvider();

function toAuthUser(u: MockUser): AuthUser {
  return { id: u.id, email: u.email, fullName: u.fullName, tier: u.tier, createdAt: u.createdAt };
}

function createDefaultProfile(userId: string): CandidateProfile {
  const now = nowIso();
  return {
    id: uid('profile'),
    userId,
    fullName: null,
    targetRole: '',
    targetCountryCode: 'DE',
    preferredLanguage: 'en',
    seniority: '',
    locationPreference: 'any',
    skills: [],
    summary: null,
    salaryTargetMin: null,
    salaryTargetMax: null,
    workAuthorization: null,
    companyBlacklist: [],
    commutePreferenceKm: null,
    portfolioLinks: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * In-memory + localStorage-backed implementation of ApiClient. Stands in for
 * apps/api (NestJS) until it ships — same method shapes, so swapping to
 * RealApiClient later is a one-line change in getApiClient().
 */
export class MockApiClient implements ApiClient {
  private getDb(): MockDb {
    const db = loadDb();
    ensureDemoSeed(db);
    saveDb(db);
    return db;
  }

  private requireUserId(db: MockDb): string {
    if (!db.sessionUserId) throw new Error('Not authenticated');
    return db.sessionUserId;
  }

  auth = {
    register: async ({ email, password, fullName }: RegisterInput): Promise<AuthSession> => {
      await delay();
      const db = this.getDb();
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail || !normalizedEmail.includes('@')) {
        throw new Error('Enter a valid email address.');
      }
      if (password.length < 8) {
        throw new Error('Password must be at least 8 characters.');
      }
      if (db.users.some((u) => u.email === normalizedEmail)) {
        throw new Error('An account with this email already exists. Try logging in instead.');
      }
      const user: MockUser = {
        id: uid('user'),
        email: normalizedEmail,
        passwordHash: weakHash(password),
        fullName: fullName?.trim() || null,
        tier: 'free',
        createdAt: nowIso(),
      };
      db.users.push(user);
      db.profiles[user.id] = createDefaultProfile(user.id);
      db.sessionUserId = user.id;
      saveDb(db);
      return { user: toAuthUser(user), token: user.id };
    },

    login: async ({ email, password }: LoginInput): Promise<AuthSession> => {
      await delay();
      const db = this.getDb();
      const normalizedEmail = email.trim().toLowerCase();
      const user = db.users.find((u) => u.email === normalizedEmail);
      if (!user || user.passwordHash !== weakHash(password)) {
        throw new Error('Invalid email or password.');
      }
      db.sessionUserId = user.id;
      saveDb(db);
      return { user: toAuthUser(user), token: user.id };
    },

    me: async (): Promise<AuthUser | null> => {
      await delay(60);
      const db = this.getDb();
      if (!db.sessionUserId) return null;
      const user = db.users.find((u) => u.id === db.sessionUserId);
      return user ? toAuthUser(user) : null;
    },

    logout: async (): Promise<void> => {
      await delay(40);
      const db = this.getDb();
      db.sessionUserId = null;
      saveDb(db);
    },
  };

  profile = {
    get: async (): Promise<CandidateProfile | null> => {
      await delay(60);
      const db = this.getDb();
      const userId = this.requireUserId(db);
      return db.profiles[userId] ?? null;
    },

    update: async (patch: Partial<CandidateProfile>): Promise<CandidateProfile> => {
      await delay();
      const db = this.getDb();
      const userId = this.requireUserId(db);
      const existing = db.profiles[userId] ?? createDefaultProfile(userId);
      const merged: CandidateProfile = {
        ...existing,
        ...patch,
        id: existing.id,
        userId,
        updatedAt: nowIso(),
      };
      db.profiles[userId] = merged;
      saveDb(db);
      return merged;
    },
  };

  cv = {
    upload: async (input: CvUploadInput) => {
      const db = this.getDb();
      const userId = this.requireUserId(db);
      let text: string;
      if (input.kind === 'text') {
        text = input.text;
      } else {
        text = await input.file.text();
        if (text.startsWith('%PDF')) {
          // The mock layer doesn't do real binary PDF parsing (that belongs
          // server-side in apps/api). Fall back to a representative
          // plain-text extraction so the flow still demonstrates real
          // parsing behavior end to end.
          text = [
            input.file.name.replace(/\.pdf$/i, ''),
            'Email: candidate@example.com',
            'Skills: TypeScript, React, Node.js, PostgreSQL',
            'Experienced software engineer with a background in full-stack web development.',
          ].join('\n');
        }
      }
      await delay(350);
      const profile = db.profiles[userId];
      const result = await aiProvider.parseCv(text, profile?.preferredLanguage || 'en');
      db.parsedCv[userId] = result;
      saveDb(db);
      return result;
    },

    getLastParsed: async () => {
      await delay(50);
      const db = this.getDb();
      const userId = this.requireUserId(db);
      return db.parsedCv[userId] ?? null;
    },
  };

  jobs = {
    search: async (filters: JobSearchFilters): Promise<JobSearchResult> => {
      await delay(200);
      const db = this.getDb();
      const userId = db.sessionUserId;
      const profile = userId ? (db.profiles[userId] ?? null) : null;

      let results = JOB_FIXTURES.slice();

      if (filters.query) {
        const q = filters.query.toLowerCase();
        results = results.filter(
          (j) =>
            j.jobTitleNormalized.toLowerCase().includes(q) ||
            j.companyNameNormalized.toLowerCase().includes(q) ||
            j.techStackTags.some((t) => t.toLowerCase().includes(q)),
        );
      }
      if (filters.title) {
        const t = filters.title.toLowerCase();
        results = results.filter((j) => j.jobTitleNormalized.toLowerCase().includes(t));
      }
      if (filters.stack && filters.stack.length > 0) {
        const wanted = filters.stack.map((s) => s.toLowerCase());
        results = results.filter((j) =>
          j.techStackTags.some((t) => wanted.includes(t.toLowerCase())),
        );
      }
      if (filters.locationCountryCode) {
        results = results.filter((j) => j.countryCode === filters.locationCountryCode);
      }
      if (filters.remoteType && filters.remoteType.length > 0) {
        results = results.filter((j) => filters.remoteType!.includes(j.remoteType));
      }
      if (filters.language) {
        results = results.filter((j) => j.language === filters.language);
      }
      if (filters.salaryMin != null) {
        results = results.filter((j) => (j.salaryMax ?? j.salaryMin ?? 0) >= filters.salaryMin!);
      }
      if (filters.seniority && filters.seniority.length > 0) {
        results = results.filter((j) => j.seniority != null && filters.seniority!.includes(j.seniority));
      }
      if (filters.sourceType && filters.sourceType.length > 0) {
        results = results.filter((j) => filters.sourceType!.includes(j.sourceType));
      }

      const total = results.length;
      const matches: JobSearchResult['matches'] = {};
      if (profile) {
        for (const job of results) {
          matches[job.jobId] = computeMatchScore(profile, job);
        }
        results.sort((a, b) => (matches[b.jobId]?.totalScore ?? 0) - (matches[a.jobId]?.totalScore ?? 0));
      } else {
        results.sort((a, b) => new Date(b.postedAt ?? 0).getTime() - new Date(a.postedAt ?? 0).getTime());
      }

      const offset = filters.offset ?? 0;
      const limit = filters.limit ?? 20;
      results = results.slice(offset, offset + limit);

      // "Why this matches" prose only needs computing for the page actually
      // returned (LLM explanation step of Search and Matching Layer).
      if (profile) {
        await Promise.all(
          results.map(async (job) => {
            const explanation = await aiProvider.generateMatchExplanation(profile, job, profile.preferredLanguage);
            matches[job.jobId] = { ...matches[job.jobId], explanation: explanation.text };
          }),
        );
      }

      return { jobs: results, matches, total };
    },

    get: async (id: string): Promise<JobDetailResult | null> => {
      await delay(120);
      const db = this.getDb();
      const job = JOB_FIXTURES.find((j) => j.jobId === id);
      if (!job) return null;
      const userId = db.sessionUserId;
      const profile = userId ? (db.profiles[userId] ?? null) : null;
      let match = profile ? computeMatchScore(profile, job) : null;
      if (profile && match) {
        const explanation = await aiProvider.generateMatchExplanation(profile, job, profile.preferredLanguage);
        match = { ...match, explanation: explanation.text };
      }
      return { job, match };
    },
  };

  applications = {
    list: async (): Promise<Application[]> => {
      await delay(120);
      const db = this.getDb();
      const userId = this.requireUserId(db);
      return db.applications
        .filter((a) => a.userId === userId)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    },

    get: async (id: string): Promise<Application | null> => {
      await delay(80);
      const db = this.getDb();
      const userId = this.requireUserId(db);
      return db.applications.find((a) => a.id === id && a.userId === userId) ?? null;
    },

    getDraft: async (id: string): Promise<ApplicationDraft | null> => {
      await delay(80);
      const db = this.getDb();
      const userId = this.requireUserId(db);
      const app = db.applications.find((a) => a.id === id && a.userId === userId);
      if (!app) return null;
      return db.applicationDrafts[id] ?? null;
    },

    create: async (jobId: string): Promise<Application> => {
      await delay(100);
      const db = this.getDb();
      const userId = this.requireUserId(db);
      const existing = db.applications.find((a) => a.userId === userId && a.jobId === jobId);
      const now = nowIso();
      if (existing) {
        if (existing.status === 'new') {
          this.recordTransition(db, existing, 'viewed', null);
        }
        saveDb(db);
        return existing;
      }
      const app: Application = { id: uid('app'), userId, jobId, status: 'new', createdAt: now, updatedAt: now };
      db.applications.push(app);
      this.recordEvent(db, app.id, null, 'new', null);
      this.recordTransition(db, app, 'viewed', null);
      saveDb(db);
      return app;
    },

    draft: async (applicationId: string): Promise<ApplicationDraft> => {
      await delay(500);
      const db = this.getDb();
      const userId = this.requireUserId(db);
      const app = db.applications.find((a) => a.id === applicationId && a.userId === userId);
      if (!app) throw new Error('Application not found.');

      if (canTransition(app.status, 'draft_ready')) {
        this.recordTransition(db, app, 'draft_ready', 'Tailored CV variant + cover letter generated.');
      } else if (app.status === 'awaiting_approval') {
        this.recordTransition(db, app, 'draft_ready', 'Draft regenerated — resubmit to request approval.');
      } else if (app.status !== 'draft_ready') {
        throw new Error(
          `Cannot generate a tailored draft from status "${app.status}". This application has already moved past drafting.`,
        );
      }

      const job = JOB_FIXTURES.find((j) => j.jobId === app.jobId);
      const profile = db.profiles[userId];
      if (!job) throw new Error('Job no longer available.');
      if (!profile || !profile.targetRole) {
        throw new Error('Complete your profile before generating a tailored draft.');
      }

      const [variant, coverLetter] = await Promise.all([
        aiProvider.generateCvVariant(profile, job, profile.preferredLanguage),
        aiProvider.generateCoverLetter(profile, job, profile.preferredLanguage),
      ]);

      const draft: ApplicationDraft = {
        id: uid('draft'),
        applicationId,
        cvVariantText: variant.text,
        coverLetterText: coverLetter.text,
        modelUsed: variant.modelUsed,
        tokensUsed: variant.tokensUsed + coverLetter.tokensUsed,
        createdAt: nowIso(),
      };
      db.applicationDrafts[applicationId] = draft;
      app.updatedAt = nowIso();
      saveDb(db);
      return draft;
    },

    updateStatus: async (
      applicationId: string,
      status: ApplicationStatus,
      note?: string,
    ): Promise<Application> => {
      await delay(200);
      const db = this.getDb();
      const userId = this.requireUserId(db);
      const app = db.applications.find((a) => a.id === applicationId && a.userId === userId);
      if (!app) throw new Error('Application not found.');

      // No same-status carve-out here, matching the real backend exactly:
      // canTransition()'s table has no self-transitions, so a same-status
      // request is rejected on both sides rather than silently no-op'd in
      // the mock only - a caller that treated this as idempotent would
      // otherwise pass here and 409 the moment it hits the real API.

      // Defense in depth: the UI never offers a control that would trigger
      // this, but the guard lives here too — approval-first is enforced at
      // the data layer, not just hidden by button placement.
      if (status === 'applied' && app.status !== 'awaiting_approval') {
        throw new Error(
          'An application can only move to "applied" from "awaiting_approval", after explicit user approval.',
        );
      }
      if (!canTransition(app.status, status)) {
        throw new Error(`Cannot move an application from "${app.status}" directly to "${status}".`);
      }

      this.recordTransition(db, app, status, note ?? null);
      saveDb(db);
      return app;
    },

    history: async (applicationId: string): Promise<ApplicationEvent[]> => {
      await delay(60);
      const db = this.getDb();
      const userId = this.requireUserId(db);
      const app = db.applications.find((a) => a.id === applicationId && a.userId === userId);
      if (!app) return [];
      return db.applicationEvents
        .filter((e) => e.applicationId === applicationId)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    },
  };

  private recordEvent(
    db: MockDb,
    applicationId: string,
    from: ApplicationStatus | null,
    to: ApplicationStatus,
    note: string | null,
  ) {
    db.applicationEvents.push({ id: uid('evt'), applicationId, fromStatus: from, toStatus: to, note, createdAt: nowIso() });
  }

  private recordTransition(db: MockDb, app: Application, to: ApplicationStatus, note: string | null) {
    this.recordEvent(db, app.id, app.status, to, note);
    app.status = to;
    app.updatedAt = nowIso();
  }
}
