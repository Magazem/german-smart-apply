import type { CandidateProfile, CanonicalJob, MarketPack } from '@german-smart-apply/shared';
import { AiProviderError } from './errors.js';
import { formatJobForPrompt, formatProfileForPrompt, isRecord } from './prompt-utils.js';

/**
 * TEMPORARY diagnostic instrumentation: an isolated, blind second model call
 * used to compare the model's own dimension-by-dimension judgment against
 * ranking.service.ts's deterministic formula, so the two can be eyeballed
 * side by side on the job detail page. Requested as a one-off comparison,
 * not a permanent feature - safe to delete wholesale: this file, the
 * estimateMatchScoreBlind() method + its tool builder in
 * anthropic-provider.ts and openrouter-provider.ts, the optional interface
 * method in types.ts, the 'matchScoreDiagnostic' TokenUsageFeature value,
 * and the gated call site in jobs.service.ts.
 *
 * Kept entirely separate from generateMatchExplanation, which now
 * legitimately tells the model the real computed score for tone calibration
 * (see its market-de prompt comment) - reusing that same call would let the
 * model anchor on the answer it was just given instead of judging
 * independently. Only titleSimilarity/skillOverlap/locationFit/languageFit/
 * salaryFit are asked of the model: the other three ranking.service.ts
 * dimensions (recency, sourceTrust, riskPenalty) aren't derivable from the
 * job posting text a model reads (recency needs "today"; the other two are
 * internal-only scores never shown to it), so those are computed exactly
 * the way ranking.service.ts computes them and folded in afterward by
 * computeMatchScoreEstimate() below, in code - not asked of the model -
 * so the comparison isolates to judgment quality, not the model's own
 * arithmetic.
 */
export const MATCH_SCORE_ESTIMATE_TOOL_NAME = 'record_match_score_estimate';

export interface MatchScoreEstimateDimensions {
  titleSimilarity: number;
  skillOverlap: number;
  locationFit: number;
  languageFit: number;
  salaryFit: number;
}

export const MATCH_SCORE_DIMENSION_DESCRIPTIONS: Record<keyof MatchScoreEstimateDimensions, string> = {
  titleSimilarity: "0-1: how well the candidate's target role/experience matches this specific job title.",
  skillOverlap: "0-1: how much the candidate's skills cover this job's tech stack/requirements.",
  locationFit: "0-1: how well the candidate's location preference fits this job's remote/hybrid/onsite type.",
  languageFit: "0-1: how well the candidate's preferred language matches the job's working language.",
  salaryFit:
    "0-1: how well the job's disclosed salary range meets the candidate's target salary (use 0.5 if either side is unknown).",
};

export function buildMatchScoreEstimateSystemPrompt(): string {
  return [
    "You are one independent input into a scoring experiment - judge how well the candidate matches the job, using only the candidate and job details given below. You have not been told, and must not guess at, any other system's score for this pairing.",
    `Call the ${MATCH_SCORE_ESTIMATE_TOOL_NAME} tool exactly once with your own 0-1 judgment for each of the five listed dimensions.`,
  ].join('\n\n');
}

export function buildMatchScoreEstimateUserContent(profile: CandidateProfile, job: CanonicalJob): string {
  return [formatProfileForPrompt(profile), 'Job details:', formatJobForPrompt(job), formatSalaryFacts(profile, job)].join(
    '\n\n',
  );
}

export function parseMatchScoreEstimateDimensions(input: unknown, context: string): MatchScoreEstimateDimensions {
  if (!isRecord(input)) {
    throw new AiProviderError(`${context}: tool input was not a JSON object`, 'malformed_response');
  }
  const dimensions = {} as MatchScoreEstimateDimensions;
  for (const key of Object.keys(MATCH_SCORE_DIMENSION_DESCRIPTIONS) as (keyof MatchScoreEstimateDimensions)[]) {
    const value = input[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new AiProviderError(`${context}: tool input missing numeric "${key}" field`, 'malformed_response');
    }
    dimensions[key] = Math.max(0, Math.min(1, value));
  }
  return dimensions;
}

/**
 * Combines the model's five judged dimensions with the three objective
 * facts (computed exactly the way ranking.service.ts computes them) using
 * the exact same weighted formula ranking.service.ts uses.
 */
export function computeMatchScoreEstimate(
  dimensions: MatchScoreEstimateDimensions,
  job: CanonicalJob,
  weights: MarketPack['rankingWeights'],
): number {
  const recency = recencyBoost(job.postedAt);
  const sourceTrust = job.sourceTrustScore;
  const riskPenalty = job.scamRiskScore;

  const weightedPositive =
    dimensions.titleSimilarity * weights.titleSimilarity +
    dimensions.skillOverlap * weights.skillOverlap +
    dimensions.locationFit * weights.locationFit +
    recency * weights.recency +
    dimensions.salaryFit * weights.salaryFit +
    dimensions.languageFit * weights.languageFit +
    sourceTrust * weights.sourceTrust;

  const totalScore = Math.max(0, Math.min(1, weightedPositive - riskPenalty * weights.riskPenalty));
  return Math.round(totalScore * 100);
}

/** Mirrors ranking.service.ts's private recencyBoost() exactly (14-day half-life decay). */
function recencyBoost(postedAt: string | null): number {
  if (!postedAt) return 0.4;
  const ageDays = (Date.now() - new Date(postedAt).getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays < 0) return 1;
  return Math.pow(0.5, ageDays / 14);
}

function formatSalaryFacts(profile: CandidateProfile, job: CanonicalJob): string {
  const target =
    profile.salaryTargetMin != null || profile.salaryTargetMax != null
      ? `${profile.salaryTargetMin ?? '?'}-${profile.salaryTargetMax ?? '?'}`
      : 'not specified';
  const offered =
    job.salaryMin != null || job.salaryMax != null
      ? `${job.salaryMin ?? '?'}-${job.salaryMax ?? '?'} ${job.salaryCurrency ?? ''}`.trim()
      : 'not disclosed';
  return `Salary facts for judging salaryFit: candidate's target is ${target}; the job's disclosed range is ${offered}.`;
}
