import type { TitleEquivalenceClass } from '@german-smart-apply/shared';

/**
 * Shared title-normalization and equivalence-class resolution logic for
 * titleEquivalenceClasses. Lives here (not duplicated in ranking.service.ts/
 * scoring.ts, where it originated) so the negative-pair corpus
 * (title-negative-pairs.ts) and the curation-engine tooling normalize/compare
 * titles the exact same way the real ranking service does, with no risk of
 * silent divergence between the three call sites.
 */

/**
 * Normalizes a FULL title string for equivalence-class lookup - lowercases,
 * strips gender-neutral job-ad suffixes like "(m/w/d)", collapses
 * hyphens/underscores/colons to spaces, drops remaining punctuation (keeping
 * unicode letters so äöüß survive), and collapses whitespace. Deliberately
 * separate from word-tokenizing: this produces one whole-phrase string, not
 * a token set, because class membership is a full-phrase match, not a
 * word-overlap one.
 */
export function normalizeFullTitle(text: string): string {
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
 * satisfy (see titleEquivalenceClasses' comment in market-de's index.ts).
 */
export function genderPairSegments(normalized: string): string[] {
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
 * Precomputed normalized-member -> classId lookup. Curated class members are
 * expected to already be in normalizeFullTitle()'s output form (lowercase,
 * whitespace-collapsed), but this normalizes them again anyway before
 * indexing - defensive, not redundant: a curator adding a class by hand
 * (e.g. via the curation engine's output) shouldn't silently ship a dead
 * entry just because they typed "Full-Stack Developer" instead of "full
 * stack developer". Re-normalizing an already-normalized string is a no-op.
 */
export function buildTitleEquivalenceIndex(classes: TitleEquivalenceClass[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const cls of classes) {
    for (const member of cls.members) {
      const normalized = normalizeFullTitle(member);
      if (normalized) index.set(normalized, cls.id);
    }
  }
  return index;
}

/**
 * Resolves a title string to its titleEquivalenceClasses id against a
 * prebuilt index (see buildTitleEquivalenceIndex), or null if it matches no
 * class (abstain - the caller falls through to plain Jaccard).
 */
export function resolveTitleEquivalenceClassId(text: string, index: Map<string, string>): string | null {
  const normalized = normalizeFullTitle(text);
  if (!normalized) return null;
  for (const candidate of [normalized, ...genderPairSegments(normalized)]) {
    const classId = index.get(candidate);
    if (classId) return classId;
  }
  return null;
}
