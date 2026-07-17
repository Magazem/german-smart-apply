import type { CanonicalJob } from '@german-smart-apply/shared';
import type { RankingProfileInput } from '../ranking.service.js';

/**
 * Ordinal, not a raw probability - an LLM judge (or a human doing the
 * periodic spot-check) can apply this consistently, unlike an unbounded
 * float. 0 = irrelevant, 4 = exactly what the candidate is looking for.
 */
export type RelevanceGrade = 0 | 1 | 2 | 3 | 4;

export interface LabeledJob {
  job: CanonicalJob;
  relevance: RelevanceGrade;
  /** Why this grade - required so every label is auditable, not a bare number. This is what a spot-check reviews. */
  rationale: string;
  /**
   * True if this job was deliberately constructed as a collision/over-collapse
   * risk case (e.g. an acronym or word shared with an unrelated field, or a
   * seniority/scope gap) rather than an ordinary foil. A structured field, not
   * a prose convention, so the harness can enforce an invariant on it directly
   * - see ranking-eval.test.ts's hard-negative check. Hard negatives span the
   * full 0-4 relevance range: some are "should score near zero" (a genuine
   * different-field acronym collision), others are legitimate partial-credit
   * cap cases (a real seniority/scope gap within the same field, typically
   * graded 2) - the invariant is about RANK relative to the query's own
   * relevance>=3 jobs, not an absolute low score.
   */
  isHardNegative?: boolean;
}

export interface LabeledQuery {
  id: string;
  profile: RankingProfileInput;
  jobs: LabeledJob[];
  /**
   * 'human' or 'llm-judge:<model-id>' - kept per-query (not global to the
   * dataset) so a mixed-provenance dataset stays auditable as LLM-judged
   * batches and manually spot-checked/corrected ones accumulate side by side.
   */
  labeledBy: string;
}
