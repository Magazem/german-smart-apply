# german-smart-apply

> Germany-first AI job search copilot. Trusted sources, deduplicated listings, scam filtering, CV tailoring, and approval-first applications.

---

## What this is

**german-smart-apply** is a SaaS platform built around one idea: job search quality beats job search volume.

Most AI job tools bulk-apply to everything on the internet, including scam listings, duplicate posts from multiple agencies, and irrelevant roles. This project takes the opposite approach — aggregate jobs from trusted, verified sources in Germany, deduplicate them before they ever reach a user, filter for scam risk, and help users apply intelligently with tailored materials and human approval before anything is submitted.

Inspired by:
- **[FreeHire](https://github.com/strelov1/freehire)** — open-source IT job aggregator with ATS-first sourcing, schema normalization, and deduplication backbone
- **[ai-job-search](https://github.com/MadsLorentzen/ai-job-search)** — Claude Code-powered job evaluation, CV tailoring, and cover letter generation
- **[career-ops](https://github.com/santifer/career-ops)** — Claude Code-powered batch pipeline, human-in-the-loop review, scoring, and dashboard

---

## Core principles

- **Trusted sources first** — jobs are pulled from company ATS pages and verified platforms, not open, low-moderation boards that host fake listings
- **Deduplicate before ranking** — the same role posted by five agencies collapses into one canonical listing
- **Scam-risk scoring** — heuristics flag suspicious listings before they reach users
- **Value before questions** — upload a CV, answer 3–5 short questions, see real matching jobs in under 5 minutes
- **Approval-first applications** — AI drafts materials, user reviews and approves, nothing is submitted blindly
- **Country-specific by design** — German CV norms, German language support, German-market job ranking
- **Gradual market expansion** — France and adjacent markets can be added as market packs without restructuring the platform

---

## Architecture overview

```
Source Adapters (ATS, trusted boards)
        │
        ▼
  Raw Ingestion Storage
        │
        ▼
  Normalization Layer (titles, companies, salaries, locations)
        │
        ▼
  Deduplication + Trust Scoring
        │
        ▼
  Canonical Job Index (PostgreSQL + Meilisearch)
        │
        ▼
  Matching + Ranking (profile fit, risk penalties)
        │
        ▼
  AI Services (CV parsing, tailoring, cover letters, explanations)
        │
        ▼
  Approval-First Application Workflow
        │
        ▼
  User Dashboard (Next.js) + Billing (Stripe) + Alerts
```

---

## User flow

### Free
1. Upload CV
2. Answer 3–5 short questions (role, location, language, seniority)
3. Receive a parsed candidate summary, CV suggestions, and top 5 trusted matching jobs
4. See one tailored application draft immediately
5. Upgrade when ready for more

### Paid
- Unlimited job matching
- Multiple tailored CV variants
- Cover letters per application
- Approval-first application queue
- Saved searches and daily digests
- Interview prep and follow-up drafts
- Full application tracker

---

## Market packs

Each country is treated as a self-contained configuration pack:

| Pack | Status |
|---|---|
| `market-de` (Germany) | Active — primary market |
| `market-fr` (France) | Planned |

A market pack contains: trusted source list, language prompts, CV formatting norms, salary parsing rules, location normalization, scam heuristics, company alias dictionaries, and ranking weights.

---

## What this is not

- Not a bulk auto-apply bot
- Not a global job scraper with no source governance
- Not a tool that sends your CV to 300 jobs without your review
- Not a product that asks you 20 questions before showing you anything useful

---

## Status

Early development. The plan and architecture are defined in `plan.md`.

See [`plan.md`](./plan.md) for the full build plan, architecture, phase breakdown, and Claude Code implementation guidance.

---

## License

MIT — see [LICENSE](./LICENSE)
