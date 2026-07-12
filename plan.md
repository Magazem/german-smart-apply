# Germany-First AI Job Search SaaS - Full Build Plan

## Goal

Build a production-ready, Germany-first AI-assisted job search SaaS that prioritizes trusted job discovery, deduplicated listings, scam avoidance, fast onboarding, high-quality tailoring, and approval-first applications. The system should be designed so an AI coding agent can implement it end to end with testing, iteration, and clear architectural boundaries.

This plan is intended to be executed by Claude Code or another strong coding agent using a command such as:

```text
/goal implement this plan.md until you finish building all and every step tested, use appropriate agents tools tasks to help you in expertised fields
```

---

## Important Context

This product is not a blind auto-apply bot. It is a trusted, market-specific job-search copilot. The system should help users discover real jobs from trusted sources, avoid duplicates and scam listings, generate tailored application materials, and apply only with explicit user approval.

The architecture should borrow selectively from three strong open-source inspirations, each for a different layer of the stack:

| Project | What to learn from | Why it matters |
|---|---|---|
| [FreeHire](https://github.com/strelov1/freehire) | Job ingestion, normalization, deduplication, source adapter thinking, clean schema, search-first backend | Aggregates tech jobs from company ATS pages, normalizes them to one schema, and deduplicates before search |
| [ai-job-search](https://github.com/MadsLorentzen/ai-job-search) | Candidate-side AI workflow, job evaluation, CV tailoring, cover-letter generation, modular Claude Code command structure | AI-powered job application framework built on Claude Code |
| [career-ops](https://github.com/santifer/career-ops) | Pipeline orchestration, batch processing, dashboard ideas, scoring flow, reports/PDF generation, human-in-the-loop application workflow | Documented architecture with scan, evaluate, batch process, PDFs, tracker pipeline, and dashboard |

None of these should be copied blindly. Synthesize the best patterns from all three and adapt them to the Germany-first, trust-first product direction.

---

## Product Thesis

Most AI job tools optimize for volume, but that leads to scam exposure, duplicate applications, poor match quality, and low trust. A better product filters smarter before it automates anything.

The SaaS should optimize for:
- Trusted-source ingestion first
- Deduplicated job discovery
- Short time-to-value onboarding
- High-confidence matching
- Approval-first applications
- Country-specific expansion by market packs

---

## Non-Negotiable Principles

- Never build blind auto-apply as the default mode
- Never prioritize job count over job trust
- Never show the same opportunity multiple times under different sources if deduplication can prevent it
- Never ask a huge questionnaire before showing value — freemium onboarding should deliver useful output in under 5 minutes
- AI should improve decisions and drafting, not replace data quality
- Architecture must support Germany first, then France later, via reusable market-specific configuration

---

## Core User Experience

### Free Experience

Goal: prove value in less than 5 minutes.

1. User lands on the site
2. User uploads CV or imports a profile document
3. User answers 3–5 short questions: target role, country, preferred language, seniority, location or remote preference
4. System parses the CV and creates a starter profile
5. System shows: a cleaned candidate summary, CV improvement suggestions, top 5 trusted deduplicated jobs, one example tailored CV or cover-letter draft, short explanation of why each job matches
6. User is invited to upgrade only after value is visible

### Paid Experience

1. User unlocks deeper profile settings
2. User adds salary targets, work authorization, company preferences, blacklists, commute preferences, portfolio links
3. System enables more recommendations, alerts, application queues, CV variants, richer tailoring, deeper tracking
4. All applications remain approval-first

---

## High-Level Architecture

The platform is built as seven cooperating layers.

### 1. Source Ingestion Layer

Purpose: fetch raw job data from trusted sources on a schedule.

Inspired by FreeHire's ingestion model: source adapters, ATS-first sourcing, one schema downstream, dedup before user consumption.

Responsibilities:
- Adapters for ATS providers: Greenhouse, Lever, Ashby, Teamtailor, SuccessFactors, and selected local German sources
- Scheduler for crawl frequency by source quality and change rate
- Raw capture of source payloads for debugging and replay
- Retry, backoff, rate limits, and source-health logging
- Domain allowlist and source-governance rules

Implementation notes:
- Start with a small trusted German source set
- Keep each adapter isolated and testable
- Every adapter emits raw data plus source metadata

### 2. Normalization Layer

Purpose: convert raw listings into one canonical job schema before search or matching.

Canonical schema fields:
- job_id, source_id, source_type, source_url, original_job_id
- company_name_raw, company_name_normalized
- job_title_raw, job_title_normalized
- job_description_html, job_description_text
- language, location_raw, location_normalized, country_code
- remote_type, employment_type, seniority
- salary_min, salary_max, salary_currency
- tech_stack_tags, apply_url
- posted_at, crawled_at
- source_trust_score, scam_risk_score

Normalization tasks:
- Standardize company names and aliases
- Standardize locations and country codes
- Extract and normalize salary information
- Detect language
- Infer seniority and work arrangement
- Clean and preserve description text
- Extract structured stack or skill tags

### 3. Deduplication and Trust Layer

Purpose: ensure the same role appears once and suspicious roles are filtered before reaching users.

This is a core product differentiator.

Functions:
- Exact deduplication using company + title + location + stable identifiers
- Near-duplicate clustering using description similarity and content fingerprints
- Company alias resolution (abbreviations, legal names, brand names)
- Canonical listing selection from duplicate clusters
- Source trust scoring
- Scam-risk heuristics: suspicious domains, company/domain mismatch, vague descriptions, external messaging contact methods, unrealistic salary patterns, unusual personal-data requests

Outputs:
- `canonical_jobs` table
- `duplicate_clusters` table
- `company_aliases` table
- trust and risk scores persisted per listing

### 4. Search and Matching Layer

Purpose: provide fast discovery and high-quality ranking for each user profile.

Responsibilities:
- Full-text job search
- Filter by title, stack, location, remote, language, salary, seniority, source type
- Rank jobs by user fit
- Explain why jobs match

Ranking approach:
1. Hard filters
2. Structured scoring
3. Risk penalties
4. LLM explanation

Scoring inputs: title similarity, skill overlap, location fit, recency, salary fit, language fit, source trust, duplicate confidence, user likes/skips history

### 5. AI Services Layer

Purpose: perform high-value AI tasks without letting AI hide bad data.

Inspired by ai-job-search for CV tailoring and job evaluation, and by career-ops for pipeline outputs and structured reports.

Capabilities:
- CV parsing to structured profile
- Candidate summary extraction
- CV rewriting suggestions
- Role-specific CV variant generation
- Cover-letter generation
- Match explanation generation
- Interview prep notes
- Follow-up email draft generation

Model routing strategy:
- Cheaper model: extraction, tagging, categorization, structured parsing
- Stronger model: candidate-facing writing tasks
- Record token usage per request, feature, and user

### 6. Application Workflow Layer

Purpose: manage drafting, approval, submission tracking, and artifacts.

Inspired by career-ops and ai-job-search for human-in-the-loop evaluation, drafting, and tracking.

Flow:
1. User opens a recommended job
2. System shows fit analysis and risks
3. User requests tailored materials
4. System generates CV variant and cover letter
5. User reviews and edits
6. User approves application
7. System submits via supported safe flow or records manual submission
8. Tracker updates status and stores artifacts

Application statuses: New → Viewed → Saved → Draft Ready → Awaiting Approval → Applied → Interview → Rejected → Offer → Archived

### 7. SaaS App Layer

Purpose: provide a product-ready UX.

Main surfaces:
- Landing page
- Sign-up and login
- Freemium onboarding
- Dashboard
- Job search
- Job detail view
- Match explanations
- Application queue
- CV workspace
- Alerts settings
- Billing page
- Admin and moderation panel

---

## Suggested Technical Stack

| Layer | Recommendation | Notes |
|---|---|---|
| Frontend | Next.js + TypeScript | Dashboard + marketing site |
| Backend API | NestJS or Fastify | Modular service boundaries |
| Database | PostgreSQL | Canonical source of truth |
| Search | Meilisearch or Postgres FTS | Fast faceted search |
| Semantic matching | pgvector | Optional for advanced ranking |
| Workers | Python (crawlers + enrichment) | Easier for scraping and AI calls |
| Queue | BullMQ (Redis) or pg-boss | Job scheduling and crawl dispatch |
| Auth | Clerk or NextAuth | Fast auth setup |
| Billing | Stripe | Subscriptions + usage metering |
| Email | Resend or Postmark | Transactional alerts and digests |
| Storage | S3-compatible | CV files and generated documents |
| Containerization | Docker + Docker Compose | Local dev and deployment |
| Deployment | Railway, Fly.io, or VPS | Easy agentic deployment |

---

## Database Domain Model

### Sources domain
- `sources` — registered job sources with trust tier and crawl config
- `source_crawl_runs` — crawl history, status, error logs
- `raw_job_snapshots` — raw captured payloads for replay

### Jobs domain
- `raw_jobs` — normalized but not deduplicated
- `canonical_jobs` — deduplicated, ranked, trusted listings
- `duplicate_clusters` — cluster membership for deduplication audit
- `company_aliases` — known name variants per company

### Users domain
- `users` — accounts and subscription status
- `candidate_profiles` — parsed CV, skills, preferences, constraints
- `cv_documents` — uploaded files and parsed results
- `saved_jobs` — bookmarked listings
- `job_interactions` — views, likes, skips, shares

### Applications domain
- `applications` — one record per user per job
- `application_drafts` — CV variant and cover letter per application
- `application_events` — status transitions and timestamps

### Alerts domain
- `saved_searches` — persistent filter sets
- `alert_deliveries` — sent alert history

---

## Market Pack Model

Each country or region is a self-contained configuration pack loaded at runtime. This allows Germany to be fully operational while France can be added later without structural changes.

A market pack contains:
- Trusted source list and adapter configs
- Language-specific prompts for AI tasks
- CV formatting norms
- Salary parsing rules and currency
- Location normalization dictionary
- Scam heuristics tuned for local patterns
- Company alias dictionary
- Ranking weights

| Pack | Status |
|---|---|
| `market-de` (Germany) | Active — primary market |
| `market-fr` (France) | Planned |

---

## Monorepo Structure

```
german-smart-apply/
├── apps/
│   ├── web/                  # Next.js frontend
│   └── api/                  # NestJS or Fastify API
├── workers/
│   ├── crawler/              # Source adapter workers
│   ├── normalizer/           # Normalization pipeline
│   ├── deduplicator/         # Dedup and trust scoring
│   └── enricher/             # AI enrichment tasks
├── packages/
│   ├── db/                   # Prisma schema and migrations
│   ├── ai/                   # AI service wrappers
│   ├── market-de/            # Germany market pack
│   ├── market-fr/            # France market pack (future)
│   └── shared/               # Shared types, utils, constants
├── infra/
│   ├── docker-compose.yml
│   └── env.example
├── plan.md                   # This file
└── README.md
```

---

## Build Phases

### Phase 1 — Foundation (MVP)

Goal: a working product with real data, real users, and real subscriptions.

Scope:
- [x] Monorepo setup with TypeScript, ESLint, Prettier
- [x] PostgreSQL schema for all seven domains with migrations
- [x] 3–5 trusted German source adapters (Greenhouse, Lever, Arbeitsagentur API, Stepstone structured feed)
- [x] Normalization pipeline for all adapters
- [x] Exact deduplication
- [x] Basic scam-risk heuristics
- [x] REST API with auth (Clerk or NextAuth)
- [x] Job search endpoint with filters
- [x] CV upload and parsing
- [x] Candidate profile creation
- [x] Top-5 job matching
- [x] One tailored cover-letter generation
- [x] Freemium onboarding flow
- [x] Stripe subscriptions (Free + Pro tiers)
- [x] Landing page
- [x] Basic dashboard
- [x] End-to-end tests for all critical paths
- [x] Docker Compose setup
- [ ] Deployment to Railway or Fly.io (config and CI/CD ready via Fly.io `fly.toml` + `release_command` + GitHub Actions; no live deploy confirmed from this environment — merge to `main` to trigger it)

### Phase 2 — Quality and Depth

Scope:
- [x] Near-duplicate clustering (embedding similarity)
- [x] Company alias dictionary (Germany)
- [x] Richer CV tailoring with multiple variants
- [x] Full application tracker
- [x] Approval-first application queue with status machine
- [x] Email alerts and saved searches
- [x] Admin panel with source health monitoring
- [x] User feedback loop (thumbs up/down per job)
- [x] Token usage tracking per user and feature
- [x] Full test coverage for all workers

### Phase 3 — Growth

Scope:
- [ ] pgvector semantic matching layer
- [ ] Interview prep module
- [x] Follow-up email drafts
- [x] PDF export for application packets
- [ ] France market pack
- [ ] Public API for partner integrations
- [ ] Referral system
- [ ] Analytics dashboard for admins

---

## Testing Strategy

Every layer must have tests before moving to the next phase.

| Layer | Test type | Coverage target |
|---|---|---|
| Source adapters | Unit + integration | Each adapter tested with fixture payloads |
| Normalization | Unit | Each field transformation tested |
| Deduplication | Unit + property-based | Exact and near-duplicate cases |
| Scam heuristics | Unit | All heuristic rules tested with examples |
| Search and ranking | Integration | Filter and sort correctness |
| AI services | Integration with mocked model | Prompt output shape validation |
| API endpoints | E2E | All authenticated and unauthenticated routes |
| Frontend flows | E2E (Playwright) | Onboarding, search, application queue |

---

## Claude Code Execution Guidance

When executing this plan with Claude Code, use the following approach:

### Agent and tool usage
- Use sub-agents for isolated domains: one agent for the crawler/normalization workers, one for the API, one for the frontend, one for the database schema
- Use the Bash tool to run migrations, tests, and lint checks after each step
- Use the filesystem tools to validate that generated files conform to the monorepo structure
- Use web search to look up current Meilisearch, Prisma, and NestJS API docs when needed — do not rely on potentially outdated training data for library-specific syntax

### Execution order
1. Scaffold monorepo structure and tooling
2. Define and migrate the full database schema
3. Build and test source adapters one by one
4. Build and test normalization pipeline
5. Build and test deduplication layer
6. Build and test API layer (auth, jobs, profiles, applications)
7. Build and test AI services layer
8. Build and test frontend (onboarding → dashboard → search → application queue)
9. Integrate Stripe billing
10. Write missing tests to reach coverage targets
11. Set up Docker Compose
12. Deploy

### Quality gates
- Do not proceed to the next step until the current step has passing tests
- Do not stub or skip tests — write real assertions against real logic
- If a step requires a real API key that is not available, stub the external call but leave a clear TODO and integration test shell
- Validate the database schema against the domain model in this document before writing any application code

### What success looks like
- A user can sign up, upload a CV, answer 5 questions, and see 5 trusted deduplicated German job matches in under 5 minutes
- A user can generate a tailored cover letter for any matched job
- A user can mark a job as applied and track its status
- The admin panel shows source health, crawl history, and dedup stats
- All Phase 1 checklist items are checked
- All tests pass
- The app is deployed and accessible
