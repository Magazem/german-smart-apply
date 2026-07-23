/**
 * Skill-evidence matching, shared by apps/api's RankingService and apps/web's
 * mock scorer so the two can't drift - same reason title-matching.ts lives
 * here rather than in either app.
 *
 * Replaces the previous Jaccard-over-techStackTags approach, which had two
 * structural problems that made skillOverlap read "always low":
 *
 * 1. Jaccard divides by the UNION, so a rich CV could never score well: 25
 *    candidate skills vs. 5 job tags with 3 matching is 3/27 = 0.11, no
 *    matter how relevant those 3 matches were. The question we actually want
 *    answered is "is there evidence this candidate's toolkit fits this job",
 *    which is not a set-similarity question.
 * 2. techStackTags is produced by a 53-entry English keyword regex
 *    (workers/normalizer/fields.py::TECH_KEYWORDS), so any non-tech posting -
 *    marketing, legal, finance, nursing, most of the Arbeitsagentur feed -
 *    has NO tags at all and could only ever hit the old hardcoded 0.1 floor.
 *
 * So we match the candidate's own skills (an open vocabulary that came from
 * their parsed CV) against the job's full description text as well as its
 * tags. The description already contains the requirements; the keyword list
 * was throwing them away.
 */

/** Words we refuse to count as evidence - see SKILL_EVIDENCE_STOPLIST. */
const SKILL_EVIDENCE_STOPLIST = new Set([
  // English and German generic competencies that appear in the boilerplate of
  // essentially every job posting ("you are a team player", "wir bieten ein
  // dynamisches Team"). Counting these as evidence would let a CV padded with
  // soft skills score a perfect match against any posting in any field -
  // the exact inverse of the always-low failure this module fixes.
  'communication',
  'kommunikation',
  'teamwork',
  'team',
  'teamplayer',
  'teamfähigkeit',
  'leadership',
  'führung',
  'management',
  'project management',
  'projektmanagement',
  'problem solving',
  'problemlösung',
  'organization',
  'organisation',
  'motivation',
  'flexibility',
  'flexibilität',
  'reliability',
  'zuverlässigkeit',
  'creativity',
  'kreativität',
  'english',
  'englisch',
  'german',
  'deutsch',
  'microsoft office',
  'ms office',
  'office',
]);

/**
 * How many distinct matched skills count as full evidence of a skill fit.
 *
 * Deliberately a FIXED denominator rather than min(target, skills.length):
 * scaling it down for sparse CVs would let a two-skill profile reach a
 * perfect 1.0 by matching both, which is weaker evidence than matching five
 * of twenty-five, not stronger. A first calibration, meant to be retuned
 * against the eval harness (apps/api/src/jobs/eval) once there's real
 * ranked-relevance data - not a value with anything deeper behind it.
 */
export const SKILL_EVIDENCE_TARGET = 5;

/** Shortest skill string we'll look for in free text. */
const MIN_SKILL_TOKEN_LENGTH = 3;

/**
 * Collapses a skill/tag string to its canonical concept key via the market
 * pack's skillAliases (identity if it isn't a known alias), so two phrases
 * describing the same underlying skill ('K8s' / 'Kubernetes') are counted
 * once. Deliberately conservative - see skillAliases' own comment for what it
 * does and doesn't collapse.
 */
export function canonicalizeSkill(value: string, skillAliases: Record<string, string>): string {
  const key = value.toLowerCase().trim();
  return skillAliases[key] ?? key;
}

/** Regex-escapes a skill so it can be matched as a literal with word boundaries. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Compiled-pattern cache. skillEvidence() runs once per candidate job -
 * CANDIDATE_POOL_SIZE is 200 in JobsService - against the same profile, so
 * without this the same handful of skills get recompiled into the same
 * regexes a few thousand times per search. Keyed by the needle, which is all
 * the pattern depends on. Safe to share: no /g flag, so there's no lastIndex
 * state to leak between calls.
 */
const TOKEN_PATTERN_CACHE = new Map<string, RegExp>();

/**
 * Whether `needle` occurs in `haystack` as a whole word/phrase. Uses explicit
 * boundary classes rather than \b because skills routinely contain characters
 * \b treats as boundaries themselves ('c++', 'node.js', 'ci/cd'), which would
 * make \b-anchored matching silently fail on exactly the multi-symbol skills
 * that most need it.
 */
function containsToken(haystack: string, needle: string): boolean {
  if (needle.length < MIN_SKILL_TOKEN_LENGTH) return false;
  let pattern = TOKEN_PATTERN_CACHE.get(needle);
  if (!pattern) {
    pattern = new RegExp(`(?<![a-z0-9äöüß])${escapeRegex(needle)}(?![a-z0-9äöüß])`, 'i');
    TOKEN_PATTERN_CACHE.set(needle, pattern);
  }
  return pattern.test(haystack);
}

export interface SkillEvidence {
  /** 0..1 evidence score, or null when there's nothing to measure. */
  score: number | null;
  /** Canonical keys of the candidate skills found in this job, for explanations. */
  matched: string[];
}

/**
 * Counts how many of the candidate's skills this job shows evidence of -
 * via its tech-stack tags OR a whole-word occurrence in its description text
 * (checked in both the raw and canonicalized spelling, since the alias table
 * maps 'k8s' -> 'kubernetes' but a posting may only ever write one of them).
 *
 * Returns null - not a low-but-real score - when the candidate has no skills
 * recorded at all. That's an unmeasurable dimension, not a measured absence,
 * and callers exclude it from the weighted score entirely (redistributing its
 * weight) rather than scoring the candidate as a poor fit for having an
 * unparsed CV. Same convention salaryFit already uses.
 */
export function skillEvidence(
  skills: string[],
  job: { techStackTags: string[]; jobDescriptionText: string },
  skillAliases: Record<string, string>,
): SkillEvidence {
  if (skills.length === 0) return { score: null, matched: [] };

  const haystack = job.jobDescriptionText ?? '';
  const tagSet = new Set(job.techStackTags.map((t) => canonicalizeSkill(t, skillAliases)));

  const matched = new Set<string>();
  for (const raw of skills) {
    const canonical = canonicalizeSkill(raw, skillAliases);
    if (SKILL_EVIDENCE_STOPLIST.has(canonical) || canonical.length < MIN_SKILL_TOKEN_LENGTH) continue;

    if (tagSet.has(canonical) || containsToken(haystack, canonical) || containsToken(haystack, raw.trim())) {
      matched.add(canonical);
    }
  }

  return {
    score: Math.min(1, matched.size / SKILL_EVIDENCE_TARGET),
    matched: Array.from(matched).sort(),
  };
}
