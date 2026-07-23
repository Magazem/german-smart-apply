/**
 * Candidate-city matching, shared by apps/api's RankingService and apps/web's
 * mock scorer - same colocation rationale as title-matching.ts.
 *
 * The previous locationFit measured only work mode (onsite/hybrid/remote vs.
 * preference) and had no candidate city to compare against at all, so an
 * onsite role in Munich scored a perfect 1.0 for a candidate in Berlin who
 * had said "onsite". Country was checked (isEligible), but every same-country
 * city was interchangeable. This adds the missing half.
 */

import type { CityFit, RelocationWillingness } from '@german-smart-apply/shared';

export interface CityPreference {
  homeCity: string | null;
  acceptableCities: string[];
  relocationWillingness: RelocationWillingness | null;
}

/**
 * Maps a free-text city onto the market pack's canonical spelling
 * ('münchen'/'munich' -> 'Munich'), so a candidate's typed city and a job's
 * normalized location compare as strings. Falls back to the trimmed input,
 * and to the first comma-separated segment, so 'Berlin, Germany' still
 * resolves against a dictionary keyed on 'berlin'.
 */
export function normalizeCity(raw: string, locationDictionary: Record<string, string>): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const direct = locationDictionary[trimmed.toLowerCase()];
  if (direct) return direct;

  const head = trimmed.split(',')[0].trim();
  return locationDictionary[head.toLowerCase()] ?? head;
}

/**
 * Classifies the job's city against the candidate's stated cities.
 *
 * Deliberately returns a category rather than a number: "wrong city and I
 * won't move" is a hard constraint the caller should surface the way it
 * surfaces a wrong country (see isEligible), while "wrong city but I'd
 * relocate" is a soft cost on an otherwise-fine match. Blending both into one
 * continuous dimension is what made the old locationFit unreadable.
 *
 * Note this does NOT distinguish within_country / within_eu / anywhere: any
 * job that reaches city comparison has already passed the target-country
 * check in isEligible, so at the city level the only distinction that can
 * still matter is whether the candidate will move at all.
 */
export function cityFit(
  preference: CityPreference,
  job: { remoteType: string; locationNormalized: string },
  locationDictionary: Record<string, string>,
): CityFit {
  if (job.remoteType === 'remote') return 'not_applicable';

  const accepted = new Set(
    [preference.homeCity, ...preference.acceptableCities]
      .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
      .map((c) => normalizeCity(c, locationDictionary)),
  );
  if (accepted.size === 0) return 'unknown';

  const jobCity = normalizeCity(job.locationNormalized, locationDictionary);
  if (!jobCity) return 'unknown';
  if (accepted.has(jobCity)) return 'match';

  // Unset willingness alongside explicitly-listed cities reads as "these are
  // the cities I want" - the conservative interpretation, and the one that
  // makes the field do what a candidate who filled it in expects.
  const willing = preference.relocationWillingness;
  if (willing === null || willing === 'no') return 'mismatch';

  return 'relocation_required';
}
