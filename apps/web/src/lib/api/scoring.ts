import type { CandidateProfile, CanonicalJob, JobMatchScore } from '@german-smart-apply/shared';

/**
 * Deterministic structured-scoring approximation of plan.md's Search and
 * Matching Layer ("Hard filters -> Structured scoring -> Risk penalties ->
 * LLM explanation"). The LLM explanation itself is produced separately by
 * @german-smart-apply/ai's generateMatchExplanation — this module only
 * covers the numeric sub-scores so the UI can show *why* a score is what it
 * is, not just the final number.
 */
export function computeMatchScore(profile: CandidateProfile, job: CanonicalJob): JobMatchScore {
  const titleSimilarity = tokenOverlapScore(profile.targetRole, job.jobTitleNormalized);

  const skillOverlap = ratioOverlap(profile.skills, job.techStackTags);

  const locationFit = computeLocationFit(profile, job);

  const recencmyBoost = computeRecencyBoost(job.postedAt);

  const salaryFit = computeSalaryFit(profile, job);

  const languageFit = normalizeLang(profile.preferredLanguage) === normalizeLang(job.language) ? 1 : 0.5;

  const sourceTrust = job.sourceTrustScore;

  const duplicateConfidence = job.duplicateConfidence;

  const riskPenalty = job.scamRiskScore;

  // Rebalanced to mirror apps/api/src/jobs/ranking.service.ts's real-backend
  // weights: titleSimilarity + skillOverlap (the only two signals that
  // measure whether the job is even in the candidate's field) now dominate,
  // rather than being outweighed by location/recency/salary/language/source
  // signals that don't know or care what field the job is in.
  const weights = {
    titleSimilarity: 0.3,
    skillOverlap: 0.32,
    locationFit: 0.1,
    recency: 0.07,
    salaryFit: 0.08,
    languageFit: 0.03,
    sourceTrust: 0.05,
    riskPenalty: 0.2, // subtracted, not added
  };

  const positive =
    titleSimilarity * weights.titleSimilarity +
    skillOverlap * weights.skillOverlap +
    locationFit * weights.locationFit +
    recencmyBoost * weights.recency +
    salaryFit * weights.salaryFit +
    languageFit * weights.languageFit +
    sourceTrust * weights.sourceTrust;

  const totalScore = Math.max(0, Math.min(1, positive - riskPenalty * weights.riskPenalty));

  return {
    jobId: job.jobId,
    totalScore: Math.round(totalScore * 100) / 100,
    titleSimilarity: round2(titleSimilarity),
    skillOverlap: round2(skillOverlap),
    locationFit: round2(locationFit),
    recencmyBoost: round2(recencmyBoost),
    salaryFit: round2(salaryFit),
    languageFit: round2(languageFit),
    sourceTrust: round2(sourceTrust),
    duplicateConfidence,
    riskPenalty: round2(riskPenalty),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function tokenOverlapScore(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return 0.1;
  let hits = 0;
  for (const t of ta) if (tb.has(t)) hits += 1;
  return Math.min(1, hits / Math.max(ta.size, 1) + (hits > 0 ? 0.1 : 0));
}

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9+#.]+/)
      .filter((t) => t.length > 1),
  );
}

function ratioOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0.1;
  const setB = new Set(b.map((s) => s.toLowerCase()));
  const hits = a.filter((s) => setB.has(s.toLowerCase())).length;
  return Math.min(1, hits / Math.min(a.length, b.length, 5));
}

function computeLocationFit(profile: CandidateProfile, job: CanonicalJob): number {
  let score: number;
  if (profile.locationPreference === 'any') score = 0.85;
  else if (profile.locationPreference === job.remoteType) score = 1;
  else if (profile.locationPreference === 'remote' && job.remoteType === 'hybrid') score = 0.55;
  else if (profile.locationPreference === 'hybrid' && job.remoteType === 'remote') score = 0.75;
  else if (profile.locationPreference === 'hybrid' && job.remoteType === 'onsite') score = 0.5;
  else if (profile.locationPreference === 'onsite' && job.remoteType === 'hybrid') score = 0.6;
  else score = 0.35;

  // Mirrors ranking.service.ts's locationFit() discount - see its comment
  // for why this is a placeholder rather than a real distance check.
  if (profile.commutePreferenceKm != null && (job.remoteType === 'onsite' || job.remoteType === 'hybrid')) {
    score *= 0.9;
  }

  return score;
}

function computeRecencyBoost(postedAt: string | null): number {
  if (!postedAt) return 0.4;
  const days = (Date.now() - new Date(postedAt).getTime()) / (1000 * 60 * 60 * 24);
  if (days <= 3) return 1;
  if (days <= 7) return 0.8;
  if (days <= 14) return 0.6;
  if (days <= 30) return 0.4;
  return 0.2;
}

function computeSalaryFit(profile: CandidateProfile, job: CanonicalJob): number {
  if (profile.salaryTargetMin == null || job.salaryMax == null) return 0.6;
  if (job.salaryMax >= profile.salaryTargetMin) return 1;
  const gap = (profile.salaryTargetMin - job.salaryMax) / profile.salaryTargetMin;
  return Math.max(0, 1 - gap * 2);
}

function normalizeLang(lang: string): string {
  return lang.trim().slice(0, 2).toLowerCase();
}

export function riskLevel(scamRiskScore: number): 'low' | 'medium' | 'high' {
  if (scamRiskScore >= 0.5) return 'high';
  if (scamRiskScore >= 0.2) return 'medium';
  return 'low';
}

export function trustLevel(sourceTrustScore: number): 'low' | 'medium' | 'high' {
  if (sourceTrustScore >= 0.8) return 'high';
  if (sourceTrustScore >= 0.5) return 'medium';
  return 'low';
}
