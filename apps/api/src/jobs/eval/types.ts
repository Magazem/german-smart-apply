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
