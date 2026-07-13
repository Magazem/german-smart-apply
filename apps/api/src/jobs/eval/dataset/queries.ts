import type { LabeledQuery } from '../types.js';
import { buildEvalJob, buildEvalProfile } from './fixtures.js';
import { BOOTSTRAP_QUERIES } from './bootstrap-queries.js';

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
 * Both queries below encode the exact bug that started this whole matching
 * investigation: a legal-counsel profile scoring nearly as high against an
 * unrelated programming job as a programmer profile scored against a
 * relevant one. If a future weight change regresses that, this harness
 * should catch it.
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
];

/**
 * The hand-written smoke queries above plus the Phase 3b LLM-judge-bootstrapped
 * corpus (bootstrap-queries.ts). Both are labeled the same way and scored by
 * the same harness (ranking-eval.test.ts); keeping them in one exported array
 * means the nDCG bar is enforced across the whole dataset.
 */
export const LABELED_QUERIES: LabeledQuery[] = [...SMOKE_QUERIES, ...BOOTSTRAP_QUERIES];
