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
  commutePreferenceKm: number | null;
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
 * Same as tokenize(), plus canonicalizing each word via marketDe.titleAliases
 * (identity if it isn't a known alias) - so titleSimilarity's Jaccard
 * comparison credits e.g. 'Sr' and 'Senior' as the same token. Kept separate
 * from tokenize() itself, which stays a generic word-splitter, because this
 * canonicalization is calibrated specifically for job-title vocabulary - see
 * titleAliases' own comment for what it deliberately does and doesn't cover.
 */
function tokenizeTitle(text: string): Set<string> {
  return new Set(Array.from(tokenize(text)).map((t) => marketDe.titleAliases[t] ?? t));
}

/**
 * Normalizes a FULL title string for titleEquivalenceClasses lookup - lower-
 * cases, strips gender-neutral job-ad suffixes like "(m/w/d)", collapses
 * hyphens/underscores/colons to spaces, drops remaining punctuation (keeping
 * unicode letters so äöüß survive), and collapses whitespace. Deliberately
 * separate from tokenize(): this produces one whole-phrase string, not a
 * token set, because class membership is a full-phrase match, not a
 * word-overlap one.
 */
function normalizeFullTitle(text: string): string {
  return text
    .toLowerCase()
    .replace(/\(\s*[mwdf]\s*\/\s*[mwdf]\s*\/\s*[mwdf]\s*\)/g, '')
    .replace(/[-_:]/g, ' ')
    .replace(/[^\p{L}\p{N}\s/]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Splits a normalized title on '/' ONLY when it looks like the German
 * masculine/feminine convention (one segment is a prefix of the other, e.g.
 * "softwareentwickler" / "softwareentwicklerin") - deliberately NOT a
 * generic slash split. A generic split would let an unrelated hybrid title
 * like "business developer / software developer" reach a class through its
 * slash sibling, widening the false-positive surface beyond the class's own
 * enumerable member list - exactly the design law this mechanism exists to
 * satisfy (see titleEquivalenceClasses' comment in market-de).
 */
function genderPairSegments(normalized: string): string[] {
  const segments = normalized
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length !== 2) return [];
  const [a, b] = segments;
  if (a.startsWith(b) || b.startsWith(a)) return segments;
  return [];
}

/**
 * Resolves a title string to its titleEquivalenceClasses id, or null if it
 * matches no class (abstain - the caller falls through to plain Jaccard).
 */
function resolveTitleEquivalenceClassId(text: string): string | null {
  const normalized = normalizeFullTitle(text);
  if (!normalized) return null;
  const candidates = new Set([normalized, ...genderPairSegments(normalized)]);
  for (const cls of marketDe.titleEquivalenceClasses) {
    for (const candidate of candidates) {
      if (cls.members.includes(candidate)) return cls.id;
    }
  }
  return null;
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
    const titleSimilarity = targetTitleText ? this.titleSimilarity(targetTitleText, job.jobTitleNormalized) : 0.5;

    const skillOverlap = profile
      ? this.skillOverlap(profile.skills, job.techStackTags)
      : 0.5;

    const locationFit = profile ? this.locationFit(profile, job) : 0.5;
    const eligible = profile ? this.isEligible(profile, job) : true;
    // Same magnitude as the old in-locationFit country discount (0.5x on the
    // locationFit-weighted term only) - this PR separates the *signal* from
    // the *scoring*, it doesn't retune how much a hard-constraint mismatch
    // should cost. Whether it deserves its own weighted dimension (rather
    // than riding on locationFit's weight) is a Phase 3 eval-harness decision,
    // same as duplicateConfidence below.
    const eligibilityPenalty = eligible ? 1 : 0.5;

    const recencmyBoost = this.recencyBoost(job.postedAt);

    const salaryFit = profile ? this.salaryFit(profile, job) : 0.5;

    const languageFit = profile
      ? this.languagesMatch(profile.preferredLanguage, job.language)
        ? 1
        : 0.5
      : 0.5;

    const sourceTrust = job.sourceTrustScore;
    // Reported, not weighted: canonical_jobs.duplicateConfidence (populated
    // by near_duplicates.py, below 1.0 on a near-dup merge survivor) is real
    // signal, but folding it into totalScore is a weights-rebalance decision
    // that belongs behind Phase 3's eval harness, not a silent addition here.
    // For now this just stops reporting a fake "always canonical" 1.
    const duplicateConfidence = job.duplicateConfidence;
    const riskPenalty = job.scamRiskScore;

    let totalScore =
      weights.titleSimilarity * titleSimilarity +
      weights.skillOverlap * skillOverlap +
      weights.locationFit * locationFit * eligibilityPenalty +
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
      eligible,
    };
  }

  /**
   * Checks marketDe.titleEquivalenceClasses first (full-phrase match, see
   * resolveTitleEquivalenceClassId) and takes the max against plain
   * per-token Jaccard - the abstention rule: a class match can only raise
   * this score to 1.0, never lower what Jaccard would have given anyway.
   */
  private titleSimilarity(targetTitleText: string, jobTitle: string): number {
    const targetClassId = resolveTitleEquivalenceClassId(targetTitleText);
    const jobClassId = resolveTitleEquivalenceClassId(jobTitle);
    const classMatch = targetClassId !== null && targetClassId === jobClassId;
    if (classMatch) return 1;
    return jaccard(tokenizeTitle(targetTitleText), tokenizeTitle(jobTitle));
  }

  private skillOverlap(skills: string[], stackTags: string[]): number {
    // 0.1, not 0: missing tag data (common on non-tech postings that were
    // never given techStackTags) shouldn't be indistinguishable from a
    // measured near-total mismatch, but it also shouldn't be generous enough
    // to meaningfully inflate an unrelated job's score - this was 0.3 before,
    // which (combined with the old, flatter weights) let e.g. a legal
    // counselor profile score within a few points of a genuinely relevant
    // programming job against a job with no tags at all.
    if (skills.length === 0 || stackTags.length === 0) return 0.1;
    const skillSet = new Set(skills.map((s) => this.canonicalizeSkill(s)));
    const tagSet = new Set(stackTags.map((t) => this.canonicalizeSkill(t)));
    return jaccard(skillSet, tagSet);
  }

  /**
   * Collapses a skill/tag string to its canonical concept key via
   * marketDe.skillAliases (identity if it isn't a known alias), so that
   * skillOverlap's Jaccard set-intersection credits two phrases describing
   * the same underlying skill (e.g. 'A/B Testing' and 'Experimentation')
   * even though they share zero literal tokens. Deliberately conservative -
   * see skillAliases' own comment for what it does and doesn't collapse.
   */
  private canonicalizeSkill(value: string): string {
    const key = value.toLowerCase().trim();
    return marketDe.skillAliases[key] ?? key;
  }

  /**
   * Pure work-mode fit (onsite/hybrid/remote vs. preference) - deliberately
   * ignores country, which is a hard-constraint concern handled by
   * isEligible() instead. A job's locationFit shouldn't silently drop because
   * it's in the wrong country; that's a different fact from "not my
   * preferred work mode" and callers need to see them separately.
   */
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

    // Placeholder pending real geo-distance data (Phase 4): commutePreferenceKm
    // is collected but there's no candidate city/postal-code field yet to
    // measure it against job.locationNormalized, so this can't verify actual
    // proximity. Setting a commute radius at all means the candidate cares
    // about physical distance for onsite/hybrid roles specifically - treating
    // an otherwise-perfect onsite/hybrid match as slightly less certain is
    // honest about that unverifiable gap, not a claim we know the distance.
    if (profile.commutePreferenceKm != null && (job.remoteType === 'onsite' || job.remoteType === 'hybrid')) {
      score *= 0.9;
    }

    return score;
  }

  /**
   * Hard constraint, not a fit signal: does this job even meet a condition
   * the candidate can't compromise on? Today that's just target country -
   * work authorization and companyBlacklist are collected on the profile
   * (see plan.md's Phase 10 auto-apply groundwork) but not yet checked here.
   * Deliberately returns a boolean, not a score, so it can't be silently
   * blended into a continuous dimension the way the old locationFit discount
   * was.
   */
  private isEligible(profile: RankingProfileInput, job: CanonicalJob): boolean {
    if (profile.targetCountryCode && profile.targetCountryCode !== job.countryCode) {
      return false;
    }
    return true;
  }

  private recencyBoost(postedAt: string | null): number {
    if (!postedAt) return 0.4;
    const ageDays = (Date.now() - new Date(postedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays < 0) return 1;
    // Exponential decay: score halves every RECENCY_HALF_LIFE_DAYS.
    return Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
  }

  private salaryFit(profile: RankingProfileInput, job: CanonicalJob): number {
    // Explicit null checks, not falsy checks: salaryTargetMin/Max of 0 is a
    // real, meaningful preference ("no floor/ceiling"), not "unset".
    if (profile.salaryTargetMin == null && profile.salaryTargetMax == null) return 0.5;
    if (job.salaryMin == null && job.salaryMax == null) return 0.5;

    const jobMin = job.salaryMin ?? job.salaryMax ?? 0;
    const jobMax = job.salaryMax ?? job.salaryMin ?? 0;
    const targetMin = profile.salaryTargetMin ?? 0;
    const targetMax = profile.salaryTargetMax ?? Number.MAX_SAFE_INTEGER;

    const overlaps = jobMax >= targetMin && jobMin <= targetMax;
    if (!overlaps) return 0.1;

    return 1;
  }

  private languagesMatch(preferred: string, jobLanguage: string): boolean {
    return preferred.slice(0, 2).toLowerCase() === jobLanguage.slice(0, 2).toLowerCase();
  }
}
