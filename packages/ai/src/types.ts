import type {
  CandidateProfile,
  CanonicalJob,
  CvVariantStyle,
  ParsedCvResult,
} from '@german-smart-apply/shared';

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

export interface FollowUpEmailResult {
  subject: string;
  body: string;
  modelUsed: string;
  tokensUsed: number;
}

export interface InterviewPrepResult {
  questions: string[];
  talkingPoints: string[];
  modelUsed: string;
  tokensUsed: number;
}

export interface ParseCvResult {
  parsed: ParsedCvResult;
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
  parseCv(rawText: string, language: string): Promise<ParseCvResult>;

  generateCvSuggestions(
    profile: CandidateProfile,
    targetJob: CanonicalJob | null,
    language: string,
  ): Promise<CvSuggestionsResult>;

  generateCvVariant(
    profile: CandidateProfile,
    job: CanonicalJob,
    language: string,
    variantStyle?: CvVariantStyle,
  ): Promise<AiGenerationResult>;

  generateCoverLetter(
    profile: CandidateProfile,
    job: CanonicalJob,
    language: string,
    variantStyle?: CvVariantStyle,
  ): Promise<AiGenerationResult>;

  generateMatchExplanation(
    profile: CandidateProfile,
    job: CanonicalJob,
    language: string,
  ): Promise<AiGenerationResult>;

  generateFollowUpEmail(
    profile: CandidateProfile,
    job: CanonicalJob,
    language: string,
    daysSinceApplied: number,
  ): Promise<FollowUpEmailResult>;

  generateInterviewPrep(
    profile: CandidateProfile,
    job: CanonicalJob,
    language: string,
  ): Promise<InterviewPrepResult>;
}

// Model IDs verified current via the claude-api skill's model catalog
// (cached 2026-06-24): the bare alias is the recommended form over a
// dated snapshot id, and both are GA/active at time of writing.
// - cheap:  Claude Haiku 4.5  - fastest/cheapest, used for extraction,
//           tagging, and structured parsing (plan.md "Model routing strategy").
// - strong: Claude Sonnet 5   - near-Opus quality on writing/agentic work
//           at Sonnet cost, used for candidate-facing writing tasks.
export const MODEL_ROUTING: Record<ModelTier, string> = {
  cheap: 'claude-haiku-4-5',
  strong: 'claude-sonnet-5',
};

// Task -> tier mapping, per plan.md "Model routing strategy":
// cheaper model for extraction/tagging/parsing, stronger model for
// candidate-facing writing.
export const TASK_MODEL_TIER: Record<
  | 'parseCv'
  | 'cvSuggestions'
  | 'cvVariant'
  | 'coverLetter'
  | 'matchExplanation'
  | 'followUpEmail'
  | 'interviewPrep',
  ModelTier
> = {
  parseCv: 'cheap',
  cvSuggestions: 'cheap',
  cvVariant: 'strong',
  coverLetter: 'strong',
  matchExplanation: 'strong',
  followUpEmail: 'strong',
  interviewPrep: 'strong',
};

// Shared prompt-instruction fragments per variant style, so the real and
// mock providers describe the same three styles consistently. 'standard' is
// intentionally the empty-string case: today's existing single-variant
// prompt wording, unchanged for free-tier users.
export const CV_VARIANT_STYLE_INSTRUCTIONS: Record<CvVariantStyle, string> = {
  standard: '',
  concise: 'Keep this version notably shorter and punchier than a standard draft - trim to the essentials, favor short sentences, and cut any content that is not directly relevant to this specific role.',
  leadership: 'Emphasize leadership, ownership, and cross-team impact throughout - frame achievements in terms of the people and initiatives led, not just individual technical contributions.',
};
