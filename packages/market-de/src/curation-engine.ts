import type { TitleEquivalenceClass } from '@german-smart-apply/shared';
import { normalizeFullTitle, resolveTitleEquivalenceClassId } from './title-matching.js';
import { TITLE_NEGATIVE_PAIRS, violatesNegativePair, type TitleNegativePair } from './title-negative-pairs.js';

/**
 * Pure, DB/AI-free logic for the title-equivalence-class curation engine
 * (Gate 2 rev B, PR2). The LLM proposer and the real-data fetchers that
 * drive this in production live elsewhere (apps/api's curation scripts) -
 * this module is the reusable, fully-unit-testable core: frequency
 * aggregation, unresolved-candidate filtering, and negative-pair
 * auto-screening. Kept DB/AI-free deliberately so it can be tested with
 * plain arrays of strings, real crawled titles included, with no live
 * dependency.
 */

export interface TitleFrequency {
  /** Most-frequently-observed original casing, for a human-readable report - not used for matching. */
  title: string;
  normalized: string;
  count: number;
}

/**
 * Counts occurrences of each distinct NORMALIZED title across raw input
 * strings (so "Senior Backend Engineer (m/w/d)" and "Senior Backend
 * Engineer" count as the same title), sorted by frequency descending. The
 * reported `title` is the first raw form observed for that normalized key,
 * not necessarily the most common raw casing.
 */
export function aggregateTitleFrequencies(rawTitles: string[]): TitleFrequency[] {
  const counts = new Map<string, { title: string; count: number }>();
  for (const raw of rawTitles) {
    const trimmed = raw.trim();
    const normalized = normalizeFullTitle(trimmed);
    if (!normalized) continue;
    const existing = counts.get(normalized);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(normalized, { title: trimmed, count: 1 });
    }
  }
  return Array.from(counts.entries())
    .map(([normalized, { title, count }]) => ({ title, normalized, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Drops titles that already resolve to a titleEquivalenceClasses entry -
 * no need to propose a classification for something Tier 2 already
 * confidently resolves. Titles Tier 1's word-aliasing might partially help
 * with are NOT filtered here: Tier 1 only aids per-token Jaccard, it never
 * fully resolves a full-title comparison the way a Tier 2 class does, so
 * there's no equivalent "already resolved" signal to filter on for it.
 */
export function filterUnresolvedCandidates(frequencies: TitleFrequency[], index: Map<string, string>): TitleFrequency[] {
  return frequencies.filter((f) => resolveTitleEquivalenceClassId(f.title, index) === null);
}

export interface ClassProposal {
  candidateTitle: string;
  proposedClassId: string;
  confidence: number;
  reasoning: string;
}

export interface ScreenedProposal extends ClassProposal {
  status: 'auto-rejected' | 'queued-for-review';
  /** Populated only when status is 'auto-rejected'. */
  screenReason?: string;
}

/**
 * Screens one LLM-proposed class assignment against the known classes and
 * the negative-pair corpus, BEFORE it can reach a human reviewer. A
 * proposal is auto-rejected if the target class doesn't exist, or if
 * joining it would place the candidate alongside an existing member that
 * TITLE_NEGATIVE_PAIRS confirms is a different occupation - this is the
 * enumerable false-positive gate the Gate 2 rev B design law (§0) requires.
 * Everything else is queued for human review (the same 5-lens audit every
 * class has gone through so far) - "queued" is not "approved"; nothing
 * enters titleEquivalenceClasses without that review, regardless of
 * confidence. Confidence is carried through as data for the reviewer to
 * prioritize/weigh, not a bypass mechanism.
 */
export function screenProposal(
  proposal: ClassProposal,
  classes: TitleEquivalenceClass[],
  negativePairs: TitleNegativePair[] = TITLE_NEGATIVE_PAIRS,
): ScreenedProposal {
  const targetClass = classes.find((c) => c.id === proposal.proposedClassId);
  if (!targetClass) {
    return { ...proposal, status: 'auto-rejected', screenReason: `Unknown class id "${proposal.proposedClassId}"` };
  }
  for (const existingMember of targetClass.members) {
    const violation = violatesNegativePair(proposal.candidateTitle, existingMember, negativePairs);
    if (violation) {
      return {
        ...proposal,
        status: 'auto-rejected',
        screenReason: `Would join "${existingMember}" in class "${targetClass.id}", but these are a confirmed negative pair: ${violation.reason}`,
      };
    }
  }
  return { ...proposal, status: 'queued-for-review' };
}
