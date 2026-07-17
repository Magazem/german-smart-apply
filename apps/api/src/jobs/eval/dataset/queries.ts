import type { LabeledQuery } from '../types.js';
import { buildEvalJob, buildEvalProfile } from './fixtures.js';
import { BOOTSTRAP_QUERIES } from './bootstrap-queries.js';
import { GATE1_QUERIES } from './gate1-queries.js';

/**
 * Smoke dataset for Phase 3a (scaffolding the harness) - hand-written,
 * deliberately small, and deliberately obvious: a backend candidate's top
 * result must be the backend job, not the legal role, full stop. This is
 * NOT the real evaluation corpus - Phase 3b bootstraps that via an
 * independent LLM judge across many more profiles/categories. This dataset
 * exists only to prove the harness itself is wired correctly end-to-end and
 * to give MIN_AVERAGE_NDCG (ranking-eval.test.ts) something real to enforce
 * from day one, however small.
 *
 * The first two queries encode the exact bug that started this whole
 * matching investigation: a legal-counsel profile scoring nearly as high
 * against an unrelated programming job as a programmer profile scored
 * against a relevant one. The third ('ai-pm-vocabulary-mismatch-de') encodes
 * a second, later bug found live: titleSimilarity/skillOverlap are plain
 * Jaccard token-set overlap, so a genuinely strong match scores near-zero on
 * skillOverlap whenever the candidate's CV and the job's tags describe the
 * same skills with different words (e.g. 'Roadmapping' vs 'Product Roadmap').
 * The mitigation - packages/market-de's skillAliases, applied via
 * RankingService.canonicalizeSkill() - is deliberately conservative: it only
 * collapses true same-concept renames, never merely-related skills. Two
 * boundary cases are worked examples inside this very query: 'Stakeholder
 * Management'/'Cross-functional Leadership' stays distinct because they're
 * adjacent competencies, not aliases; 'A/B Testing'/'Experimentation' was
 * shipped as an alias initially, then REMOVED after a 5-lens adversarial
 * audit found it was the same over-collapse mistake (a specific technique
 * standing in for the broader discipline) despite passing solo review - see
 * skillAliases' own comment for the audit's reasoning. See
 * ranking.service.test.ts's skill-alias describe block for the positive and
 * negative-control coverage behind that boundary. The fourth
 * ('title-synonym-mismatch-de') isolates the sibling bug on the title side:
 * titleSimilarity is plain Jaccard on word tokens over freeform text (not
 * the discrete phrase arrays skillOverlap/skillAliases operate on), so
 * 'Software Engineer' and 'Full-Stack Developer' - plan.md Phase 4b's own
 * named example - share zero tokens and score 0 title similarity even with
 * an identical skill set. See market-de's titleAliases for the mitigation.
 */
const SMOKE_QUERIES: LabeledQuery[] = [
  {
    id: 'backend-engineer-de',
    labeledBy: 'human',
    profile: buildEvalProfile({
      targetRole: 'Backend Engineer',
      skills: ['TypeScript', 'Node.js', 'PostgreSQL', 'AWS'],
    }),
    jobs: [
      {
        relevance: 4,
        rationale: 'Exact title and skill-stack match.',
        job: buildEvalJob({
          jobId: 'eval-backend-senior',
          jobTitleNormalized: 'senior backend engineer',
          techStackTags: ['TypeScript', 'Node.js', 'PostgreSQL', 'AWS'],
        }),
      },
      {
        relevance: 3,
        rationale: 'Adjacent role, meaningful skill overlap (AWS), different day-to-day focus.',
        job: buildEvalJob({
          jobId: 'eval-devops',
          jobTitleNormalized: 'devops engineer',
          techStackTags: ['AWS', 'Kubernetes', 'Terraform'],
        }),
      },
      {
        relevance: 2,
        rationale: 'Same broad field (software engineering), low direct skill overlap.',
        job: buildEvalJob({
          jobId: 'eval-frontend',
          jobTitleNormalized: 'frontend engineer',
          techStackTags: ['React', 'TypeScript', 'CSS'],
        }),
      },
      {
        relevance: 0,
        rationale: 'Different field entirely, zero skill overlap - the case this dataset exists to catch.',
        job: buildEvalJob({
          jobId: 'eval-legal-counsel',
          jobTitleNormalized: 'legal counsel',
          techStackTags: ['Contract Law', 'Compliance', 'Negotiation'],
        }),
      },
    ],
  },
  {
    id: 'legal-counsel-de',
    labeledBy: 'human',
    profile: buildEvalProfile({
      targetRole: 'Legal Counsel',
      skills: ['Contract Law', 'Compliance', 'Negotiation'],
    }),
    jobs: [
      {
        relevance: 4,
        rationale: 'Exact title and skill-stack match.',
        job: buildEvalJob({
          jobId: 'eval-legal-counsel-2',
          jobTitleNormalized: 'legal counsel',
          techStackTags: ['Contract Law', 'Compliance', 'Negotiation'],
        }),
      },
      {
        relevance: 3,
        rationale: 'Adjacent legal/regulatory role, meaningful overlap (Compliance).',
        job: buildEvalJob({
          jobId: 'eval-compliance-officer',
          jobTitleNormalized: 'compliance officer',
          techStackTags: ['Compliance', 'Risk Management', 'Regulatory Reporting'],
        }),
      },
      {
        relevance: 1,
        rationale: 'Different field, only glancing overlap (negotiation is a shared soft skill, not domain expertise).',
        job: buildEvalJob({
          jobId: 'eval-marketing-manager',
          jobTitleNormalized: 'marketing manager',
          techStackTags: ['Negotiation', 'Campaign Management', 'SEO'],
        }),
      },
      {
        relevance: 0,
        rationale: 'Different field entirely, zero skill overlap - the mirror image of the backend query above.',
        job: buildEvalJob({
          jobId: 'eval-backend-senior-2',
          jobTitleNormalized: 'senior backend engineer',
          techStackTags: ['TypeScript', 'Node.js', 'PostgreSQL', 'AWS'],
        }),
      },
    ],
  },
  {
    id: 'ai-pm-vocabulary-mismatch-de',
    labeledBy: 'human',
    profile: buildEvalProfile({
      targetRole: 'AI Product Manager',
      skills: ['Stakeholder Management', 'A/B Testing', 'Roadmapping', 'Fintech'],
      seniority: 'senior',
    }),
    jobs: [
      {
        relevance: 4,
        rationale:
          "Same seniority, same function, adjacent domain (fintech AI product). One of the candidate's four skills is the same activity phrased differently - 'Roadmapping'/'Product Roadmap' - plus an exact 'Fintech' match. 'Stakeholder Management'/'Cross-functional Leadership' and 'A/B Testing'/'Experimentation' both LOOK like the same kind of pair but are deliberately NOT credited: the former are adjacent PM competencies, the latter is a specific technique standing in for a broader discipline (an alias for it shipped initially, then was removed after a 5-lens adversarial audit unanimously flagged the same over-collapse risk - see market-de's skillAliases comment). Even with that conservative read, a same-seniority, same-function match on a majority of skills scored ~35-40% live under plain Jaccard matching, with zero literal token overlap masking a genuinely strong candidate - a human evaluator would call this a 4, not a 2.",
        job: buildEvalJob({
          jobId: 'eval-ai-pm-synonym-job',
          jobTitleNormalized: 'senior product manager ai platform',
          seniority: 'senior',
          techStackTags: ['Cross-functional Leadership', 'Experimentation', 'Product Roadmap', 'Fintech'],
        }),
      },
      {
        relevance: 2,
        rationale: 'Same broad field (product/tech), but backend engineering day-to-day, not product management.',
        job: buildEvalJob({
          jobId: 'eval-backend-senior-3',
          jobTitleNormalized: 'senior backend engineer',
          techStackTags: ['TypeScript', 'Node.js', 'PostgreSQL', 'AWS'],
        }),
      },
      {
        relevance: 1,
        rationale: 'Commercial, stakeholder-facing adjacency, but marketing is not product management.',
        job: buildEvalJob({
          jobId: 'eval-marketing-manager-3',
          jobTitleNormalized: 'marketing manager',
          techStackTags: ['Negotiation', 'Campaign Management', 'SEO'],
        }),
      },
      {
        relevance: 0,
        rationale: 'Different field entirely, zero skill overlap.',
        job: buildEvalJob({
          jobId: 'eval-legal-counsel-3',
          jobTitleNormalized: 'legal counsel',
          techStackTags: ['Contract Law', 'Compliance', 'Negotiation'],
        }),
      },
    ],
  },
  {
    // plan.md Phase 4b's own named example: 'Software Engineer' and
    // 'Full-Stack Developer' share zero word tokens, so titleSimilarity
    // (32% of the score, same weight as skillOverlap) drops to 0 no matter
    // how good the actual match is. The 'correct' job below deliberately
    // reuses the profile's exact skill list, so skillOverlap is pinned at
    // 1.0 - any score gap here is attributable to titleSimilarity alone,
    // not skill-matching noise. See titleAliases in market-de for the
    // (deliberately conservative, audited) mitigation.
    id: 'title-synonym-mismatch-de',
    labeledBy: 'human',
    profile: buildEvalProfile({
      targetRole: 'Software Engineer',
      skills: ['TypeScript', 'Node.js', 'PostgreSQL', 'AWS'],
    }),
    jobs: [
      {
        relevance: 4,
        rationale:
          "Identical tech stack (skillOverlap = 1.0) and the same core engineering role, just a different title convention - many companies use 'Software Engineer' and 'Developer' as the literal same job. Zero shared title tokens ('software'/'engineer' vs 'full-stack'/'developer') should not be able to drag a job this close to a perfect skill match down anywhere near the bottom of the ranking - a human evaluator would call this a 4.",
        job: buildEvalJob({
          jobId: 'eval-fullstack-developer-synonym-job',
          jobTitleNormalized: 'full-stack developer',
          techStackTags: ['TypeScript', 'Node.js', 'PostgreSQL', 'AWS'],
        }),
      },
      {
        relevance: 3,
        rationale: 'Adjacent engineering role, meaningful skill overlap (AWS), different day-to-day focus.',
        job: buildEvalJob({
          jobId: 'eval-devops-4',
          jobTitleNormalized: 'devops engineer',
          techStackTags: ['AWS', 'Kubernetes', 'Terraform'],
        }),
      },
      {
        relevance: 1,
        rationale: 'Different field, only a glancing overlap (both roles touch technology, nothing else in common).',
        job: buildEvalJob({
          jobId: 'eval-marketing-manager-4',
          jobTitleNormalized: 'marketing manager',
          techStackTags: ['Negotiation', 'Campaign Management', 'SEO'],
        }),
      },
      {
        relevance: 0,
        rationale: 'Different field entirely, zero skill overlap.',
        job: buildEvalJob({
          jobId: 'eval-legal-counsel-4',
          jobTitleNormalized: 'legal counsel',
          techStackTags: ['Contract Law', 'Compliance', 'Negotiation'],
        }),
      },
    ],
  },
];

/**
 * The hand-written smoke queries above, the Phase 3b LLM-judge-bootstrapped
 * corpus (bootstrap-queries.ts), and Gate 1's adjudicated expansion
 * (gate1-queries.ts - see its own header for provenance and the semantic-
 * matching-cascade investigation this feeds). All three are labeled the same
 * way and scored by the same harness (ranking-eval.test.ts); keeping them in
 * one exported array means the nDCG bar is enforced across the whole dataset.
 */
export const LABELED_QUERIES: LabeledQuery[] = [...SMOKE_QUERIES, ...BOOTSTRAP_QUERIES, ...GATE1_QUERIES];
