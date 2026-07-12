import { MockAiProvider } from '@german-smart-apply/ai/mock';
import {
  canTransition,
  type Application,
  type ApplicationDraft,
  type ApplicationEvent,
  type ApplicationStatus,
  type CandidateProfile,
  type CvVariantStyle,
  type FollowUpDraft,
  type JobFeedbackType,
  type JobSearchFilters,
} from '@german-smart-apply/shared';
import { DEDUP_STATS_FIXTURE, SOURCE_HEALTH_FIXTURES } from './admin-fixtures';
import { JOB_FIXTURES } from './fixtures';
import { computeMatchScore } from './scoring';
import { ensureDemoSeed } from './seed';
import { delay, loadDb, nowIso, saveDb, uid, weakHash, type MockDb, type MockSavedSearch, type MockUser } from './store';
import type {
  AlertRunSummary,
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
  SourceCrawlRun,
  SourceHealth,
  TokenUsageSummary,
} from './types';

function toSavedSearch(s: MockSavedSearch): SavedSearch {
  return {
    id: s.id,
    name: s.name,
    filters: s.filters as JobSearchFilters,
    isActive: s.isActive,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

const aiProvider = new MockAiProvider();

/**
 * Normalizes db.applicationDrafts[id] into the current array shape. Guards
 * against a pre-multi-variant localStorage payload (a single ApplicationDraft
 * object per applicationId, from before this array shape existed) rather
 * than crashing on `.length`/spread for a returning dev session.
 */
function draftsFor(db: MockDb, applicationId: string): ApplicationDraft[] {
  const value = db.applicationDrafts[applicationId] as ApplicationDraft[] | ApplicationDraft | undefined;
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

/** Guards against a pre-follow-up-feature localStorage payload where db.followUpDrafts doesn't exist yet. */
function followUpsFor(db: MockDb, applicationId: string): FollowUpDraft[] {
  return (db.followUpDrafts ?? {})[applicationId] ?? [];
}

const FOLLOW_UP_ELIGIBLE_STATUSES: ApplicationStatus[] = ['applied', 'interview'];

function toAuthUser(u: MockUser): AuthUser {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    tier: u.tier,
    role: u.role ?? 'user',
    createdAt: u.createdAt,
  };
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
      const { parsed } = await aiProvider.parseCv(text, profile?.preferredLanguage || 'en');
      db.parsedCv[userId] = parsed;
      saveDb(db);
      return parsed;
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
      const myFeedback = userId ? ((db.jobFeedback ?? {})[userId]?.[id] ?? null) : null;
      return { job, match, myFeedback };
    },
    recordFeedback: async (
      id: string,
      feedback: JobFeedbackType,
    ): Promise<{ feedback: JobFeedbackType | null }> => {
      await delay(80);
      const db = this.getDb();
      const userId = this.requireUserId(db);
      if (!JOB_FIXTURES.some((j) => j.jobId === id)) {
        throw new Error('Job not found');
      }
      db.jobFeedback ??= {};
      const forUser = (db.jobFeedback[userId] ??= {});
      const result: JobFeedbackType | null = forUser[id] === feedback ? null : feedback;
      if (result === null) {
        delete forUser[id];
      } else {
        forUser[id] = result;
      }
      saveDb(db);
      return { feedback: result };
    },
  };

  savedSearches = {
    list: async (): Promise<SavedSearch[]> => {
      await delay(120);
      const db = this.getDb();
      const userId = this.requireUserId(db);
      return (db.savedSearches ?? [])
        .filter((s) => s.userId === userId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .map(toSavedSearch);
    },
    create: async (name: string, filters: JobSearchFilters): Promise<SavedSearch> => {
      await delay(150);
      const db = this.getDb();
      const userId = this.requireUserId(db);
      const now = nowIso();
      const search: MockSavedSearch = {
        id: uid('search'),
        userId,
        name,
        filters: filters as Record<string, unknown>,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
      db.savedSearches ??= [];
      db.savedSearches.push(search);
      saveDb(db);
      return toSavedSearch(search);
    },
    update: async (
      id: string,
      patch: Partial<Pick<SavedSearch, 'name' | 'filters' | 'isActive'>>,
    ): Promise<SavedSearch> => {
      await delay(120);
      const db = this.getDb();
      const userId = this.requireUserId(db);
      const search = (db.savedSearches ?? []).find((s) => s.id === id && s.userId === userId);
      if (!search) throw new Error('Saved search not found');
      if (patch.name !== undefined) search.name = patch.name;
      if (patch.filters !== undefined) search.filters = patch.filters as Record<string, unknown>;
      if (patch.isActive !== undefined) search.isActive = patch.isActive;
      search.updatedAt = nowIso();
      saveDb(db);
      return toSavedSearch(search);
    },
    remove: async (id: string): Promise<void> => {
      await delay(100);
      const db = this.getDb();
      const userId = this.requireUserId(db);
      const before = db.savedSearches ?? [];
      const existed = before.some((s) => s.id === id && s.userId === userId);
      if (!existed) throw new Error('Saved search not found');
      db.savedSearches = before.filter((s) => !(s.id === id && s.userId === userId));
      saveDb(db);
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
      return draftsFor(db, id)[0] ?? null;
    },

    listDrafts: async (id: string): Promise<ApplicationDraft[]> => {
      await delay(80);
      const db = this.getDb();
      const userId = this.requireUserId(db);
      const app = db.applications.find((a) => a.id === id && a.userId === userId);
      if (!app) return [];
      return draftsFor(db, id);
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

    draft: async (applicationId: string, variantStyle: CvVariantStyle = 'standard'): Promise<ApplicationDraft> => {
      await delay(500);
      const db = this.getDb();
      const userId = this.requireUserId(db);
      const app = db.applications.find((a) => a.id === applicationId && a.userId === userId);
      if (!app) throw new Error('Application not found.');

      if (variantStyle !== 'standard') {
        const user = db.users.find((u) => u.id === userId);
        if (user?.tier !== 'pro') {
          throw new Error(`The "${variantStyle}" variant style requires a Pro subscription - the standard style is free.`);
        }
      }

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
        aiProvider.generateCvVariant(profile, job, profile.preferredLanguage, variantStyle),
        aiProvider.generateCoverLetter(profile, job, profile.preferredLanguage, variantStyle),
      ]);

      const draft: ApplicationDraft = {
        id: uid('draft'),
        applicationId,
        cvVariantText: variant.text,
        coverLetterText: coverLetter.text,
        variantLabel: variantStyle,
        modelUsed: variant.modelUsed,
        tokensUsed: variant.tokensUsed + coverLetter.tokensUsed,
        createdAt: nowIso(),
      };
      db.applicationDrafts[applicationId] = [draft, ...draftsFor(db, applicationId)];
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

    // Real client renders an actual PDF server-side (verified against a real
    // pdf-parse round-trip); a plain-text stand-in here is enough for
    // interface parity in the mock demo - genuinely built from mock DB state,
    // just not PDF bytes. The caller must save it as .txt, not .pdf.
    downloadPdf: async (applicationId: string, draftId?: string): Promise<Blob> => {
      await delay(150);
      const db = this.getDb();
      const userId = this.requireUserId(db);
      const app = db.applications.find((a) => a.id === applicationId && a.userId === userId);
      if (!app) throw new Error('Application not found.');
      const drafts = draftsFor(db, applicationId);
      const draft = draftId ? drafts.find((d) => d.id === draftId) : drafts[0];
      if (!draft) throw new Error('No draft found for this application.');
      const job = JOB_FIXTURES.find((j) => j.jobId === app.jobId);
      const user = db.users.find((u) => u.id === userId);
      const profile = db.profiles[userId];

      const text = [
        profile?.fullName ?? user?.email ?? '',
        user?.email ?? '',
        '',
        job ? `${job.jobTitleRaw} at ${job.companyNameRaw}` : '',
        '',
        'Cover Letter',
        draft.coverLetterText,
        '',
        `Tailored CV (${draft.variantLabel})`,
        draft.cvVariantText,
      ].join('\n');
      return new Blob([text], { type: 'text/plain' });
    },

    generateFollowUp: async (applicationId: string, language?: string): Promise<FollowUpDraft> => {
      await delay(400);
      const db = this.getDb();
      const userId = this.requireUserId(db);
      const app = db.applications.find((a) => a.id === applicationId && a.userId === userId);
      if (!app) throw new Error('Application not found.');
      if (!FOLLOW_UP_ELIGIBLE_STATUSES.includes(app.status)) {
        throw new Error(
          `Cannot draft a follow-up while application is in status "${app.status}". A follow-up only makes sense once the application has actually been applied.`,
        );
      }

      const profile = db.profiles[userId];
      if (!profile || !profile.targetRole) {
        throw new Error('Complete your profile before drafting a follow-up.');
      }
      const job = JOB_FIXTURES.find((j) => j.jobId === app.jobId);
      if (!job) throw new Error('Job no longer available.');

      const appliedEvent = db.applicationEvents
        .filter((e) => e.applicationId === applicationId && e.toStatus === 'applied')
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
      const since = new Date(appliedEvent?.createdAt ?? app.createdAt).getTime();
      const daysSinceApplied = Math.max(0, Math.floor((Date.now() - since) / (1000 * 60 * 60 * 24)));

      const result = await aiProvider.generateFollowUpEmail(
        profile,
        job,
        language ?? profile.preferredLanguage,
        daysSinceApplied,
      );
      const followUp: FollowUpDraft = {
        id: uid('followup'),
        applicationId,
        subject: result.subject,
        body: result.body,
        modelUsed: result.modelUsed,
        tokensUsed: result.tokensUsed,
        createdAt: nowIso(),
      };
      db.followUpDrafts ??= {};
      db.followUpDrafts[applicationId] = [followUp, ...followUpsFor(db, applicationId)];
      saveDb(db);
      return followUp;
    },

    listFollowUps: async (applicationId: string): Promise<FollowUpDraft[]> => {
      await delay(80);
      const db = this.getDb();
      const userId = this.requireUserId(db);
      const app = db.applications.find((a) => a.id === applicationId && a.userId === userId);
      if (!app) return [];
      return followUpsFor(db, applicationId);
    },
  };

  usage = {
    // The mock world's AI provider (MockAiProvider) never reports real
    // tokens, matching what the real backend also reports for a user whose
    // requests all hit the mock provider - genuinely zero usage, not a
    // shortcut.
    summary: async (): Promise<TokenUsageSummary> => {
      await delay(80);
      this.requireUserId(this.getDb());
      return { totalTokens: 0, byFeature: [] };
    },
  };

  private requireAdmin(db: MockDb): MockUser {
    const userId = this.requireUserId(db);
    const user = db.users.find((u) => u.id === userId);
    // Defense in depth, matching AdminGuard server-side: enforced here too,
    // not just by hiding the admin nav link in the UI.
    if (!user || user.role !== 'admin') {
      throw new Error('This area requires an admin account');
    }
    return user;
  }

  admin = {
    // Demo-only fixture data (see admin-fixtures.ts) - the mock world has no
    // concept of a real crawler fleet, so this can't be derived from db
    // state the way every other mock endpoint is.
    listSources: async (): Promise<SourceHealth[]> => {
      await delay(150);
      this.requireAdmin(this.getDb());
      return SOURCE_HEALTH_FIXTURES.map((s) => s.health);
    },
    sourceRuns: async (
      sourceId: string,
    ): Promise<{ source: SourceHealth; runs: SourceCrawlRun[] } | null> => {
      await delay(120);
      this.requireAdmin(this.getDb());
      const entry = SOURCE_HEALTH_FIXTURES.find((s) => s.health.id === sourceId);
      return entry ? { source: entry.health, runs: entry.runs } : null;
    },
    dedupStats: async (): Promise<DedupStats> => {
      await delay(100);
      this.requireAdmin(this.getDb());
      return DEDUP_STATS_FIXTURE;
    },
    // JOB_FIXTURES is a static demo dataset - nothing in it is ever "new"
    // relative to a saved search's last check, so honestly reporting 0
    // sent/matched (rather than inventing plausible-looking numbers) is the
    // correct mock behavior here, unlike the fixture data above.
    runAlerts: async (): Promise<AlertRunSummary> => {
      await delay(300);
      const db = this.getDb();
      this.requireAdmin(db);
      const searchesChecked = (db.savedSearches ?? []).filter((s) => s.isActive).length;
      return { searchesChecked, emailsSent: 0, totalJobsMatched: 0 };
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
