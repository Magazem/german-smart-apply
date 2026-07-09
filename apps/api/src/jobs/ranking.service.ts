import { Injectable } from '@nestjs/common';
import { marketDe } from '@german-smart-apply/market-de';
import type { CanonicalJob, JobMatchScore } from '@german-smart-apply/shared';

/**
 * Only the profile fields the ranking formula actually reads. Decoupled from
 * both the Prisma `CandidateProfile` model (Date fields, extra columns) and
 * the shared `CandidateProfile` DTO (string timestamps) so callers can pass
 * either without a lossy round-trip.
 */
export interface RankingProfileInput {
  skills: string[];
  targetRole: string;
  targetCountryCode: string;
  preferredLanguage: string;
  seniority: string;
  locationPreference: string;
  salaryTargetMin: number | null;
  salaryTargetMax: number | null;
}

export interface RankingContext {
  profile: RankingProfileInput | null;
  /** Free-text query/title typed into the search box, used when there's no profile to rank against. */
  queryText?: string;
  /** +1 liked, -1 skipped, 0/undefined neutral — from job_interactions history. */
  interactionBias?: number;
}

const RECENCY_HALF_LIFE_DAYS = 14;

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9äöüß]+/i)
      .filter((t) => t.length > 1),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Structured scoring per plan.md's "Ranking approach": hard filters happen at
 * the query layer (JobsService); this computes the weighted score from
 * title similarity, skill overlap, location fit, recency, salary fit,
 * language fit, source trust, minus a risk penalty — weighted per the
 * active market pack (`market-de` for now; swappable per-country later).
 */
@Injectable()
export class RankingService {
  score(job: CanonicalJob, ctx: RankingContext): JobMatchScore {
    const weights = marketDe.rankingWeights;
    const { profile } = ctx;

    const targetTitleText = profile?.targetRole ?? ctx.queryText ?? '';
    const titleSimilarity = targetTitleText
      ? jaccard(tokenize(targetTitleText), tokenize(job.jobTitleNormalized))
      : 0.5;

    const skillOverlap = profile
      ? this.skillOverlap(profile.skills, job.techStackTags)
      : 0.5;

    const locationFit = profile ? this.locationFit(profile, job) : 0.5;

    const recencmyBoost = this.recencyBoost(job.postedAt);

    const salaryFit = profile ? this.salaryFit(profile, job) : 0.5;

    const languageFit = profile
      ? this.languagesMatch(profile.preferredLanguage, job.language)
        ? 1
        : 0.5
      : 0.5;

    const sourceTrust = job.sourceTrustScore;
    const duplicateConfidence = 1; // populated by caller when known; default neutral
    const riskPenalty = job.scamRiskScore;

    let totalScore =
      weights.titleSimilarity * titleSimilarity +
      weights.skillOverlap * skillOverlap +
      weights.locationFit * locationFit +
      weights.recency * recencmyBoost +
      weights.salaryFit * salaryFit +
      weights.languageFit * languageFit +
      weights.sourceTrust * sourceTrust -
      weights.riskPenalty * riskPenalty;

    if (ctx.interactionBias) {
      totalScore += ctx.interactionBias * 0.05;
    }

    totalScore = Math.max(0, Math.min(1, totalScore));

    return {
      jobId: job.jobId,
      totalScore,
      titleSimilarity,
      skillOverlap,
      locationFit,
      recencmyBoost,
      salaryFit,
      languageFit,
      sourceTrust,
      duplicateConfidence,
      riskPenalty,
    };
  }

  private skillOverlap(skills: string[], stackTags: string[]): number {
    if (skills.length === 0 || stackTags.length === 0) return 0.3;
    const skillSet = new Set(skills.map((s) => s.toLowerCase()));
    const tagSet = new Set(stackTags.map((t) => t.toLowerCase()));
    return jaccard(skillSet, tagSet);
  }

  private locationFit(profile: RankingProfileInput, job: CanonicalJob): number {
    let score = 0.5;
    if (profile.locationPreference === 'any') {
      score = 0.8;
    } else if (profile.locationPreference === job.remoteType) {
      score = 1;
    } else if (job.remoteType === 'remote') {
      // Remote roles satisfy most onsite/hybrid preferences reasonably well.
      score = 0.7;
    } else {
      score = 0.3;
    }

    if (profile.targetCountryCode && profile.targetCountryCode !== job.countryCode) {
      score *= 0.5;
    }
    return score;
  }

  private recencyBoost(postedAt: string | null): number {
    if (!postedAt) return 0.4;
    const ageDays = (Date.now() - new Date(postedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays < 0) return 1;
    // Exponential decay: score halves every RECENCY_HALF_LIFE_DAYS.
    return Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
  }

  private salaryFit(profile: RankingProfileInput, job: CanonicalJob): number {
    if (!profile.salaryTargetMin && !profile.salaryTargetMax) return 0.5;
    if (job.salaryMin == null && job.salaryMax == null) return 0.5;

    const jobMin = job.salaryMin ?? job.salaryMax ?? 0;
    const jobMax = job.salaryMax ?? job.salaryMin ?? 0;
    const targetMin = profile.salaryTargetMin ?? 0;
    const targetMax = profile.salaryTargetMax ?? Number.MAX_SAFE_INTEGER;

    const overlaps = jobMax >= targetMin && jobMin <= targetMax;
    if (!overlaps) return 0.1;

    if (profile.salaryTargetMin && jobMax < profile.salaryTargetMin) return 0.3;
    return 1;
  }

  private languagesMatch(preferred: string, jobLanguage: string): boolean {
    return preferred.slice(0, 2).toLowerCase() === jobLanguage.slice(0, 2).toLowerCase();
  }
}
