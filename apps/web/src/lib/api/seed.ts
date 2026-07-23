import type {
  Application,
  ApplicationDraft,
  ApplicationEvent,
  CandidateProfile,
  ParsedCvResult,
} from '@german-smart-apply/shared';
import { uid, weakHash, type MockDb, type MockUser } from './store';

export const DEMO_EMAIL = 'demo@smartapply.de';
export const DEMO_PASSWORD = 'demo1234';

/**
 * Seeds a ready-to-explore demo account so the application queue, job
 * search, and CV workspace all have realistic content on first load —
 * without requiring every reviewer/tester to run the full onboarding wizard
 * first. Only runs once (idempotent on email).
 */
export function ensureDemoSeed(db: MockDb): void {
  if (db.users.some((u) => u.email === DEMO_EMAIL)) return;

  const userId = uid('user');
  const demoUser: MockUser = {
    id: userId,
    email: DEMO_EMAIL,
    passwordHash: weakHash(DEMO_PASSWORD),
    fullName: 'Alex Demo',
    tier: 'pro',
    // Pre-promoted so the demo account can showcase every feature —
    // including the admin panel — without manual localStorage surgery.
    // Mirrors the real world's "no self-serve path to admin" via a doc'd
    // manual DB update; this is that same manual step, just pre-applied.
    role: 'admin',
    createdAt: '2026-06-20T09:00:00.000Z',
  };
  db.users.push(demoUser);

  const demoExperience = [
    {
      title: 'Backend Engineer',
      company: 'PayFlow GmbH',
      startDate: '2022-01',
      endDate: null,
      description: 'Own payments-ledger services handling 2M+ transactions/day.',
    },
    {
      title: 'Software Engineer',
      company: 'LogiTrack AG',
      startDate: '2019-06',
      endDate: '2021-12',
      description: 'Built tracking APIs for a European logistics platform.',
    },
  ];
  const demoEducation = [
    {
      degree: 'B.Sc. Computer Science',
      institution: 'TU Berlin',
      startYear: 2015,
      endYear: 2019,
    },
  ];
  const demoLanguages = ['en', 'de'];

  const profile: CandidateProfile = {
    id: uid('profile'),
    userId,
    fullName: 'Alex Demo',
    // Same values as parsedCv below - demonstrates a CV parse's contact
    // info/experience/education/languages actually surviving onto the
    // profile the AI layer prompts from, not just living in the disconnected
    // "last parsed CV" record the way it used to.
    email: DEMO_EMAIL,
    phone: '+49 151 0000000',
    targetRole: 'Backend Engineer',
    targetCountryCode: 'DE',
    preferredLanguage: 'en',
    seniority: 'mid',
    locationPreference: 'hybrid',
    skills: ['TypeScript', 'Node.js', 'Java', 'PostgreSQL', 'Docker', 'AWS'],
    summary:
      'Backend engineer with 5 years of experience building event-driven services in fintech and logistics. Comfortable owning services end to end, from design through on-call.',
    experience: demoExperience,
    education: demoEducation,
    languages: demoLanguages,
    salaryTargetMin: 65000,
    salaryTargetMax: 85000,
    workAuthorization: 'EU work permit (no sponsorship required)',
    companyBlacklist: [],
    // Set on the demo profile (unlike a real new user's, which starts empty)
    // so the seeded experience actually exercises city matching - an onsite
    // Munich role should visibly rank below an equivalent Berlin one.
    homeCity: 'Berlin',
    acceptableCities: ['Potsdam'],
    relocationWillingness: 'no',
    commutePreferenceKm: 15,
    portfolioLinks: ['https://github.com/alex-demo'],
    createdAt: '2026-06-20T09:05:00.000Z',
    updatedAt: '2026-06-20T09:05:00.000Z',
  };
  db.profiles[userId] = profile;

  const parsedCv: ParsedCvResult = {
    fullName: 'Alex Demo',
    email: DEMO_EMAIL,
    phone: '+49 151 0000000',
    summary:
      'Backend engineer with 5 years of experience building event-driven services in fintech and logistics.',
    skills: ['TypeScript', 'Node.js', 'Java', 'PostgreSQL', 'Docker', 'AWS'],
    experience: demoExperience,
    education: demoEducation,
    languages: demoLanguages,
    suggestions: [
      'Quantify the impact of your payments-ledger work (uptime %, transaction volume, incidents prevented).',
      'Add a short "core skills" line near the top so applicant-tracking systems surface TypeScript and Java immediately.',
      'Mention your German language level explicitly — several trusted sources default to German-language postings.',
    ],
  };
  db.parsedCv[userId] = parsedCv;

  const events: ApplicationEvent[] = [];
  const apps: Application[] = [];
  const drafts: Record<string, ApplicationDraft[]> = {};

  function pushEvent(applicationId: string, from: ApplicationEvent['fromStatus'], to: ApplicationEvent['toStatus'], note: string | null, at: string) {
    events.push({ id: uid('evt'), applicationId, fromStatus: from, toStatus: to, note, createdAt: at });
  }

  // 1) Saved, no draft yet.
  const app1Id = uid('app');
  apps.push({
    id: app1Id,
    userId,
    jobId: 'job-02',
    status: 'saved',
    createdAt: '2026-07-05T11:00:00.000Z',
    updatedAt: '2026-07-05T11:05:00.000Z',
  });
  pushEvent(app1Id, null, 'new', null, '2026-07-05T11:00:00.000Z');
  pushEvent(app1Id, 'new', 'viewed', null, '2026-07-05T11:01:00.000Z');
  pushEvent(app1Id, 'viewed', 'saved', null, '2026-07-05T11:05:00.000Z');

  // 2) Awaiting approval, draft ready — the E2E anchor for the approval flow.
  const app2Id = uid('app');
  apps.push({
    id: app2Id,
    userId,
    jobId: 'job-01',
    status: 'awaiting_approval',
    createdAt: '2026-07-06T09:00:00.000Z',
    updatedAt: '2026-07-08T08:30:00.000Z',
  });
  pushEvent(app2Id, null, 'new', null, '2026-07-06T09:00:00.000Z');
  pushEvent(app2Id, 'new', 'viewed', null, '2026-07-06T09:01:00.000Z');
  pushEvent(app2Id, 'viewed', 'saved', null, '2026-07-06T09:10:00.000Z');
  pushEvent(app2Id, 'saved', 'draft_ready', 'Tailored CV variant + cover letter generated.', '2026-07-08T08:00:00.000Z');
  pushEvent(app2Id, 'draft_ready', 'awaiting_approval', 'Submitted for your review.', '2026-07-08T08:30:00.000Z');
  drafts[app2Id] = [
    {
      id: uid('draft'),
      applicationId: app2Id,
      cvVariantText:
        'Alex Demo — CV tailored for Senior Backend Engineer at Zalando.\n\nSummary: Backend engineer with 5 years building event-driven checkout and payments services at fintech and logistics scale.\n\nCore skills: Java, Kotlin, Kafka, TypeScript, PostgreSQL, AWS, Docker.\n\nExperience:\n- Backend Engineer, PayFlow GmbH (2022–present): own payments-ledger services handling 2M+ transactions/day; led migration to event-driven Kafka pipeline, cutting incident count by 40%.\n- Software Engineer, LogiTrack AG (2019–2021): built tracking APIs for a European logistics platform.',
      coverLetterText:
        'Dear Zalando Hiring Team,\n\nI am writing to apply for the Senior Backend Engineer role. My background building high-throughput, event-driven payment services at PayFlow closely mirrors the scale challenges of Zalando\'s checkout platform — 2M+ daily transactions with strict reliability requirements.\n\nI would welcome the chance to bring that experience to your team.\n\nBest regards,\nAlex Demo',
      variantLabel: 'standard',
      modelUsed: 'mock',
      tokensUsed: 0,
      createdAt: '2026-07-08T08:00:00.000Z',
    },
  ];

  // 3) Already applied (approved earlier), now in interview.
  const app3Id = uid('app');
  apps.push({
    id: app3Id,
    userId,
    jobId: 'job-04',
    status: 'interview',
    createdAt: '2026-06-22T09:00:00.000Z',
    updatedAt: '2026-07-01T09:00:00.000Z',
  });
  pushEvent(app3Id, null, 'new', null, '2026-06-22T09:00:00.000Z');
  pushEvent(app3Id, 'new', 'viewed', null, '2026-06-22T09:02:00.000Z');
  pushEvent(app3Id, 'viewed', 'draft_ready', 'Tailored CV variant + cover letter generated.', '2026-06-23T10:00:00.000Z');
  pushEvent(app3Id, 'draft_ready', 'awaiting_approval', 'Submitted for your review.', '2026-06-23T10:15:00.000Z');
  pushEvent(app3Id, 'awaiting_approval', 'applied', 'Approved and submitted by you.', '2026-06-24T08:00:00.000Z');
  pushEvent(app3Id, 'applied', 'interview', 'Recruiter scheduled a call.', '2026-07-01T09:00:00.000Z');
  drafts[app3Id] = [
    {
      id: uid('draft'),
      applicationId: app3Id,
      cvVariantText:
        'Alex Demo — CV tailored for DevOps Engineer at Delivery Hero.\n\nCore skills: Kubernetes, Terraform, AWS, Docker, Go.',
      coverLetterText:
        'Dear Delivery Hero Team,\n\nI am excited to apply for the DevOps Engineer role and bring my experience operating resilient, high-throughput platforms.\n\nBest regards,\nAlex Demo',
      variantLabel: 'standard',
      modelUsed: 'mock',
      tokensUsed: 0,
      createdAt: '2026-06-23T10:00:00.000Z',
    },
  ];

  // 4) Merely viewed a high-risk listing — demonstrates risk is visible, not hidden, and nothing auto-advanced.
  const app4Id = uid('app');
  apps.push({
    id: app4Id,
    userId,
    jobId: 'job-10',
    status: 'viewed',
    createdAt: '2026-07-08T12:00:00.000Z',
    updatedAt: '2026-07-08T12:01:00.000Z',
  });
  pushEvent(app4Id, null, 'new', null, '2026-07-08T12:00:00.000Z');
  pushEvent(app4Id, 'new', 'viewed', null, '2026-07-08T12:01:00.000Z');

  db.applications.push(...apps);
  db.applicationEvents.push(...events);
  Object.assign(db.applicationDrafts, drafts);
}
