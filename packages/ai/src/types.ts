import type { CandidateProfile, CanonicalJob, ParsedCvResult } from '@german-smart-apply/shared';

export type ModelTier = 'cheap' | 'strong';

export interface AiGenerationResult {
  text: string;
  modelUsed: string;
  tokensUsed: number;
}

export interface CvSuggestionsResult {
  suggestions: string[];
  modelUsed: string;
  tokensUsed: number;
}

/**
 * The single seam between the product (API, workers) and any model backend.
 * Swap the provider returned by createAiProvider() without touching callers -
 * everything upstream codes against this interface, never against a specific
 * SDK or prompt.
 */
export interface AiProvider {
  parseCv(rawText: string, language: string): Promise<ParsedCvResult>;

  generateCvSuggestions(
    profile: CandidateProfile,
    targetJob: CanonicalJob | null,
    language: string,
  ): Promise<CvSuggestionsResult>;

  generateCvVariant(
    profile: CandidateProfile,
    job: CanonicalJob,
    language: string,
  ): Promise<AiGenerationResult>;

  generateCoverLetter(
    profile: CandidateProfile,
    job: CanonicalJob,
    language: string,
  ): Promise<AiGenerationResult>;

  generateMatchExplanation(
    profile: CandidateProfile,
    job: CanonicalJob,
    language: string,
  ): Promise<AiGenerationResult>;
}

export const MODEL_ROUTING: Record<ModelTier, string> = {
  cheap: 'claude-haiku-4-5-20251001',
  strong: 'claude-sonnet-5',
};

// Task -> tier mapping, per plan.md "Model routing strategy":
// cheaper model for extraction/tagging/parsing, stronger model for
// candidate-facing writing.
export const TASK_MODEL_TIER: Record<
  'parseCv' | 'cvSuggestions' | 'cvVariant' | 'coverLetter' | 'matchExplanation',
  ModelTier
> = {
  parseCv: 'cheap',
  cvSuggestions: 'cheap',
  cvVariant: 'strong',
  coverLetter: 'strong',
  matchExplanation: 'strong',
};
