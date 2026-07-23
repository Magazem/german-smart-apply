/**
 * Candidate-language matching, shared by apps/api's RankingService and
 * apps/web's mock scorer - same colocation rationale as title-matching.ts.
 *
 * Fixes a real bug in the previous languageFit: it compared
 * `profile.preferredLanguage` - which is the UI/interface language the user
 * picked - against the language a posting happens to be WRITTEN in, and
 * ignored `profile.languages[]` entirely, even though CV parsing populates
 * it. A candidate fluent in German and English who set the interface to
 * English scored a flat 0.5 against every German-language posting.
 *
 * `preferredLanguage` is deliberately NOT consulted here any more. It stays
 * what its name says - a display preference - and is no longer overloaded as
 * evidence of what the candidate actually speaks.
 */

/**
 * Language names as they realistically appear in a parsed CV's languages[],
 * mapped to ISO 639-1. Covers the endonym, the English name, and the German
 * name for the languages common on CVs in this market. Anything unrecognized
 * falls through to a leading two-letter prefix, so an already-coded entry
 * ('de', 'en-GB') still resolves.
 */
const LANGUAGE_NAME_TO_CODE: Record<string, string> = {
  german: 'de',
  deutsch: 'de',
  englisch: 'en',
  english: 'en',
  french: 'fr',
  französisch: 'fr',
  francais: 'fr',
  français: 'fr',
  spanish: 'es',
  spanisch: 'es',
  español: 'es',
  espanol: 'es',
  italian: 'it',
  italienisch: 'it',
  italiano: 'it',
  turkish: 'tr',
  türkisch: 'tr',
  türkçe: 'tr',
  russian: 'ru',
  russisch: 'ru',
  polish: 'pl',
  polnisch: 'pl',
  polski: 'pl',
  arabic: 'ar',
  arabisch: 'ar',
  dutch: 'nl',
  niederländisch: 'nl',
  portuguese: 'pt',
  portugiesisch: 'pt',
  chinese: 'zh',
  chinesisch: 'zh',
  mandarin: 'zh',
  ukrainian: 'uk',
  ukrainisch: 'uk',
  romanian: 'ro',
  rumänisch: 'ro',
  hindi: 'hi',
};

/**
 * Score for a candidate whose recorded languages don't include the one the
 * posting is written in. Low rather than neutral - this is a measured gap,
 * not missing data - but not zero, because `job.language` is only a proxy for
 * the working language: German employers routinely post in English for roles
 * that are conducted in German and vice versa. Reading the actual required
 * language and level out of the posting text needs real extraction, which
 * this deterministic pass deliberately doesn't attempt.
 */
const LANGUAGE_MISMATCH_SCORE = 0.25;

/**
 * Extracts the ISO 639-1 code from one CV languages[] entry. Handles the
 * shapes CV parsing actually produces - 'German', 'German (C1)', 'Deutsch -
 * Muttersprache', 'en', 'English, fluent' - by stripping any proficiency
 * qualifier after a bracket, dash, comma, or slash and resolving what's left.
 * Returns null when nothing recognizable is left.
 */
export function toLanguageCode(entry: string): string | null {
  const head = entry
    .toLowerCase()
    .split(/[([\-–—,/|:]/)[0]
    .trim();
  if (!head) return null;

  const mapped = LANGUAGE_NAME_TO_CODE[head];
  if (mapped) return mapped;

  // Already a code ('de', 'en-GB'), or an unmapped name we can't do better
  // than its prefix for. Two letters only - a longer unrecognized word would
  // produce a bogus code that could collide with a real one.
  if (/^[a-z]{2}$/.test(head)) return head;
  if (/^[a-z]{2}-[a-z]{2}$/.test(head)) return head.slice(0, 2);
  return null;
}

/**
 * 1 when the candidate records a language matching the posting's, a low
 * LANGUAGE_MISMATCH_SCORE when they demonstrably don't, and null when they
 * have no languages recorded at all - unmeasurable, so callers drop the
 * dimension and redistribute its weight rather than inventing a neutral 0.5.
 *
 * Note that null is the common case for a profile created without a CV
 * upload; that's intended. Reporting "we can't tell" is more honest than the
 * old behavior of reporting a confident-looking 50% that was really just the
 * UI language failing to equal the posting language.
 */
export function languageFitScore(candidateLanguages: string[], jobLanguage: string): number | null {
  const codes = new Set(candidateLanguages.map(toLanguageCode).filter((c): c is string => c !== null));
  if (codes.size === 0) return null;

  const jobCode = toLanguageCode(jobLanguage);
  if (jobCode === null) return null;

  return codes.has(jobCode) ? 1 : LANGUAGE_MISMATCH_SCORE;
}
