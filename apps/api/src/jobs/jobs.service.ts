import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { CandidateProfile as PrismaCandidateProfile, Prisma } from '@german-smart-apply/db';
import type { CanonicalJob, JobFeedbackType, JobMatchScore } from '@german-smart-apply/shared';
import { AiProviderFactory } from '../ai/ai-provider-factory.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TokenUsageService } from '../token-usage/token-usage.service.js';
import { toSharedCandidateProfile } from '../profile/candidate-profile.mapper.js';
import { toSharedCanonicalJob } from './canonical-job.mapper.js';
import type { SearchJobsDto } from './dto/search-jobs.dto.js';
import { RankingService, type RankingProfileInput, type ScorableJob } from './ranking.service.js';

export interface RankedJobResult {
  job: CanonicalJob;
  score: JobMatchScore;
  myFeedback?: JobFeedbackType | null;
}

// Absolute ceiling on how many jobs one search will score in-process. This is
// NOT the old recency pool: it sits far above the whole visible corpus
// (~12.9k) and exists only so an unbounded corpus can't OOM the API. Hitting
// it is a bug to fix, not a normal operating mode, so search() logs loudly
// when it does rather than silently returning a truncated ranking.
const MAX_SCORED_CANDIDATES = 50_000;
const DEFAULT_PAGE_SIZE = 20;
const ALERT_MATCH_LIMIT = 20;

/**
 * Exactly the columns RankingService.score() reads - see ScorableJob. Notably
 * absent: `jobDescriptionHtml`, which is as large as the description text and
 * is never scored against, and the whole Source row.
 */
const SCORING_SELECT = {
  id: true,
  jobTitleNormalized: true,
  techStackTags: true,
  language: true,
  countryCode: true,
  remoteType: true,
  locationNormalized: true,
  salaryMin: true,
  salaryMax: true,
  postedAt: true,
  sourceTrustScore: true,
  scamRiskScore: true,
  duplicateConfidence: true,
  rawJob: { select: { jobDescriptionText: true } },
} satisfies Prisma.CanonicalJobSelect;

type ScoringRow = Prisma.CanonicalJobGetPayload<{ select: typeof SCORING_SELECT }>;

function toScorableJob(record: ScoringRow): ScorableJob {
  return {
    jobId: record.id,
    jobTitleNormalized: record.jobTitleNormalized,
    jobDescriptionText: record.rawJob.jobDescriptionText,
    techStackTags: record.techStackTags,
    language: record.language,
    countryCode: record.countryCode,
    remoteType: record.remoteType as ScorableJob['remoteType'],
    locationNormalized: record.locationNormalized,
    salaryMin: record.salaryMin,
    salaryMax: record.salaryMax,
    postedAt: record.postedAt ? record.postedAt.toISOString() : null,
    sourceTrustScore: record.sourceTrustScore,
    scamRiskScore: record.scamRiskScore,
    duplicateConfidence: record.duplicateConfidence,
  };
}

/**
 * The ranking-relevant slice of a CandidateProfile row. Pure - no I/O, so a
 * caller that already holds the row doesn't re-query for it. Shared by the
 * search, job-detail and match-explanation paths, which each used to spell
 * this mapping out and so had to be kept in step by hand - the same drift
 * hazard that already bit apps/web's mock scorer.
 */
function toRankingProfile(profile: PrismaCandidateProfile): RankingProfileInput {
  return {
    skills: profile.skills,
    targetRole: profile.targetRole,
    targetCountryCode: profile.targetCountryCode,
    preferredLanguage: profile.preferredLanguage,
    languages: profile.languages,
    seniority: profile.seniority,
    locationPreference: profile.locationPreference,
    homeCity: profile.homeCity,
    acceptableCities: profile.acceptableCities,
    relocationWillingness: profile.relocationWillingness as RankingProfileInput['relocationWillingness'],
    salaryTargetMin: profile.salaryTargetMin,
    salaryTargetMax: profile.salaryTargetMax,
    commutePreferenceKm: profile.commutePreferenceKm,
  };
}

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ranking: RankingService,
    private readonly tokenUsage: TokenUsageService,
    private readonly aiProviderFactory: AiProviderFactory,
  ) {}

  /**
   * Rank every job matching the hard filters, then return one page of the
   * result.
   *
   * The scoring set is deliberately the WHOLE filtered set, not a slice of it.
   * This previously fetched the `CANDIDATE_POOL_SIZE` (200) most recently
   * posted matches and scored only those, which made the headline feature
   * wrong rather than merely approximate: with 12,902 visible jobs, 12,702
   * (98.4%) could never be scored at all, and the 200-row cut reached back
   * only about 21 hours. A candidate's best match was returned only if it
   * happened to have been posted that day. Narrowing the query by hand (a role
   * filter, say) shrank the matching set below 200 and the good job appeared -
   * which is exactly how the bug was found, and why it looked like a ranking
   * problem when it was really a retrieval one.
   *
   * Scoring is a pure in-process calculation (no I/O per job), so the cost of
   * scoring everything is the row fetch, not the arithmetic. That fetch is kept
   * cheap by selecting only the scored columns - see SCORING_SELECT - and the
   * full DTO is hydrated for one page of results at the end. Replacing this
   * with a real search index (Postgres FTS/pgvector) is still the Phase 3 plan;
   * this makes the answer correct in the meantime instead of fast and wrong.
   */
  async search(filters: SearchJobsDto, userId?: string) {
    const where = this.buildWhere(filters);

    const candidates = await this.prisma.client.canonicalJob.findMany({
      where,
      select: SCORING_SELECT,
      // Only decides WHICH rows survive the MAX_SCORED_CANDIDATES safety
      // ceiling, not the order results come back in - that is the score sort
      // below. `nulls: 'last'` is still load-bearing: postedAt is nullable and
      // Postgres sorts NULLs FIRST on DESC, so a plain `postedAt: 'desc'` would
      // put every undated posting ahead of every dated one at the cut.
      orderBy: { postedAt: { sort: 'desc', nulls: 'last' } },
      take: MAX_SCORED_CANDIDATES,
    });

    if (candidates.length === MAX_SCORED_CANDIDATES) {
      this.logger.warn(
        `Search hit the ${MAX_SCORED_CANDIDATES}-row scoring ceiling; ranking is truncated and ` +
          `the best match may be missing. Move search behind a real index rather than raising this.`,
      );
    }

    const rankingProfile = await this.loadRankingProfile(userId);
    const interactionBias = await this.loadInteractionBias(userId);

    const scored = candidates.map((record) => ({
      id: record.id,
      score: this.ranking.score(toScorableJob(record), {
        profile: rankingProfile,
        queryText: filters.query ?? filters.title,
        interactionBias: interactionBias.get(record.id),
      }),
    }));

    scored.sort((a, b) => b.score.totalScore - a.score.totalScore);

    const limit = filters.limit ?? DEFAULT_PAGE_SIZE;
    const offset = filters.offset ?? 0;
    const page = scored.slice(offset, offset + limit);

    // Hydrate the full DTO (raw company/title/apply URL/description HTML, and
    // the joined Source row) for the returned page only - one small query
    // instead of carrying those columns for every scored row.
    const hydrated = await this.prisma.client.canonicalJob.findMany({
      where: { id: { in: page.map((entry) => entry.id) } },
      include: { rawJob: { include: { source: true } } },
    });
    const byId = new Map(hydrated.map((record) => [record.id, toSharedCanonicalJob(record)]));

    const results: RankedJobResult[] = [];
    for (const entry of page) {
      const job = byId.get(entry.id);
      // Absent only if the row was deleted between the two queries.
      if (job) results.push({ job, score: entry.score });
    }

    return {
      total: scored.length,
      limit,
      offset,
      results,
    };
  }

  /**
   * Jobs matching `filters` that entered canonical_jobs after `since` -
   * used by the alerting worker to find what's new for a saved search since
   * its last delivery, rather than re-notifying on the same matches every
   * run. Unranked (no ranking profile involved - a saved search has its own
   * explicit filters, not a candidate profile to score against) and ordered
   * by newest first, capped at ALERT_MATCH_LIMIT so one saved search can't
   * generate an unbounded email.
   */
  async findNewMatches(filters: SearchJobsDto, since: Date): Promise<CanonicalJob[]> {
    const where = this.buildWhere(filters);
    const records = await this.prisma.client.canonicalJob.findMany({
      where: { ...where, createdAt: { gt: since } },
      include: { rawJob: { include: { source: true } } },
      orderBy: { createdAt: 'desc' },
      take: ALERT_MATCH_LIMIT,
    });
    return records.map(toSharedCanonicalJob);
  }

  async getById(id: string, userId?: string): Promise<RankedJobResult> {
    let record = await this.prisma.client.canonicalJob.findFirst({
      where: { id, isVisible: true },
      include: { rawJob: { include: { source: true } } },
    });

    if (!record) {
      // Not found outright, or hidden because near-duplicate clustering
      // (workers/deduplicator/near_duplicates.py) merged it into a
      // still-visible winner. An existing Application/SavedJob can point
      // at this now-hidden id, so resolve through the cluster rather than
      // 404ing on what the user's tracker still shows as "their" job.
      record = await this.resolveThroughNearDupCluster(id);
    }
    if (!record) {
      throw new NotFoundException('Job not found');
    }

    const job = toSharedCanonicalJob(record);
    const profile = userId
      ? await this.prisma.client.candidateProfile.findUnique({ where: { userId } })
      : null;

    let myFeedback: JobFeedbackType | null = null;
    if (userId) {
      await this.prisma.client.jobInteraction
        .create({ data: { userId, canonicalJobId: record.id, interactionType: 'view' } })
        .catch(() => undefined);

      const feedbackRow = await this.prisma.client.jobInteraction.findFirst({
        where: { userId, canonicalJobId: record.id, interactionType: { in: ['like', 'skip'] } },
      });
      if (feedbackRow) {
        myFeedback = feedbackRow.interactionType as JobFeedbackType;
      }
    }

    const rankingProfile = profile ? toRankingProfile(profile) : null;

    const score = this.ranking.score(job, { profile: rankingProfile });

    // NB: the LLM-written match explanation is deliberately NOT generated
    // here. It used to be, which meant the entire job-detail page sat behind
    // a skeleton for however long the provider took to answer. It has its
    // own endpoint now (getMatchExplanation below) that the page fetches
    // after painting, so everything except that one block appears at once.
    return { job, score, myFeedback };
  }

  /**
   * The "Why this matches" prose, split out of getById so a slow AI provider
   * only delays that one block instead of the whole job-detail response.
   *
   * Returns `{ explanation: null }` instead of throwing when there is no
   * profile to match against, or when the provider fails - the block is a
   * nice-to-have, and the caller collapses it exactly as it did back when a
   * failure here just left `score.explanation` unset.
   */
  async getMatchExplanation(id: string, userId?: string): Promise<{ explanation: string | null }> {
    const record = await this.findVisibleOrClusterWinner(id);
    if (!record) {
      throw new NotFoundException('Job not found');
    }
    if (!userId) {
      return { explanation: null };
    }

    const profile = await this.prisma.client.candidateProfile.findUnique({ where: { userId } });
    if (!profile) {
      return { explanation: null };
    }

    const job = toSharedCanonicalJob(record);
    const sharedProfile = toSharedCandidateProfile(profile);
    // Recomputed rather than passed in from the client: ranking.score is a
    // pure local calculation (no I/O), and trusting a client-supplied score
    // would let the caller steer what the model is told about the match.
    const score = this.ranking.score(job, { profile: toRankingProfile(profile) });

    let explanation: string | null = null;
    try {
      const aiProvider = await this.aiProviderFactory.getProvider();
      const explanationResult = await aiProvider.generateMatchExplanation(
        sharedProfile,
        job,
        profile.preferredLanguage,
        score.totalScore,
      );
      explanation = explanationResult.text;
      await this.tokenUsage.record(
        profile.userId,
        'matchExplanation',
        explanationResult.modelUsed,
        explanationResult.tokensUsed,
      );
    } catch (err) {
      this.logger.warn(`Match explanation generation failed for job ${id}: ${String(err)}`);
    }

    // TEMPORARY diagnostic (delete freely, see
    // packages/ai/src/match-score-estimate.ts): an independent, blind
    // second model call that judges the ranking dimensions itself and
    // combines them with our own weights, so the result can be eyeballed
    // against score.totalScore above. Gated so it isn't a second
    // strong-tier call on every job-detail view for every user - only
    // fires when explicitly enabled, and only against a real provider
    // (MockAiProvider doesn't implement estimateMatchScoreBlind).
    if (process.env.MATCH_SCORE_DIAGNOSTIC_ENABLED === 'true') {
      try {
        const aiProvider = await this.aiProviderFactory.getProvider();
        if (aiProvider.estimateMatchScoreBlind) {
          const estimate = await aiProvider.estimateMatchScoreBlind(sharedProfile, job);
          explanation = [
            explanation,
            `Self-estimated match (internal test, blind to our real score): ${estimate.percentage}%`,
          ]
            .filter(Boolean)
            .join('\n\n');
          await this.tokenUsage.record(profile.userId, 'matchScoreDiagnostic', 'diagnostic', estimate.tokensUsed);
        }
      } catch (err) {
        this.logger.warn(`Match score diagnostic estimate failed for job ${id}: ${String(err)}`);
      }
    }

    return { explanation };
  }

  /** Shared by getById and getMatchExplanation: the visible row, or the near-dup winner it was merged into. */
  private async findVisibleOrClusterWinner(id: string) {
    const record = await this.prisma.client.canonicalJob.findFirst({
      where: { id, isVisible: true },
      include: { rawJob: { include: { source: true } } },
    });
    return record ?? (await this.resolveThroughNearDupCluster(id));
  }

  /**
   * `id` exists (or existed) but isVisible=false. That only happens via
   * near-duplicate clustering hiding a loser in favor of a winner (exact
   * dedup never creates a canonical_jobs row that later gets hidden) - walk
   * rawJobId -> duplicate_cluster_members -> duplicate_clusters.canonicalJobId
   * to find that winner, still isVisible=true.
   */
  private async resolveThroughNearDupCluster(id: string) {
    const hidden = await this.prisma.client.canonicalJob.findUnique({ where: { id } });
    if (!hidden) return null;

    // Every near-dup candidate was already its OWN exact-dedup winner, so
    // its rawJobId also has a pre-existing self-referencing membership row
    // from run_dedup - the clusterKey prefix disambiguates that from the
    // real near-dup membership pointing at the *other* job's winner.
    const member = await this.prisma.client.duplicateClusterMember.findFirst({
      where: { rawJobId: hidden.rawJobId, duplicateCluster: { clusterKey: { startsWith: 'near-dup:' } } },
      include: { duplicateCluster: true },
    });
    if (!member) return null;

    return this.prisma.client.canonicalJob.findFirst({
      where: { id: member.duplicateCluster.canonicalJobId, isVisible: true },
      include: { rawJob: { include: { source: true } } },
    });
  }

  /**
   * Thumbs up/down are mutually exclusive per (user, job) — unlike 'view',
   * which is an append-only log, at most one like/skip row may exist at a
   * time so RankingService's interactionBias lookup is unambiguous.
   * Re-sending the currently-active feedback toggles it off (undo).
   */
  async recordFeedback(
    userId: string,
    canonicalJobId: string,
    feedback: JobFeedbackType,
  ): Promise<{ feedback: JobFeedbackType | null }> {
    const job = await this.prisma.client.canonicalJob.findFirst({
      where: { id: canonicalJobId, isVisible: true },
    });
    if (!job) {
      throw new NotFoundException('Job not found');
    }

    return this.prisma.client.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.jobInteraction.findFirst({
        where: { userId, canonicalJobId, interactionType: { in: ['like', 'skip'] } },
      });

      if (existing) {
        await tx.jobInteraction.delete({ where: { id: existing.id } });
        if (existing.interactionType === feedback) {
          return { feedback: null };
        }
      }

      await tx.jobInteraction.create({
        data: { userId, canonicalJobId, interactionType: feedback },
      });
      return { feedback };
    });
  }

  private buildWhere(filters: SearchJobsDto): Prisma.CanonicalJobWhereInput {
    const where: Prisma.CanonicalJobWhereInput = { isVisible: true };

    if (filters.locationCountryCode) {
      where.countryCode = filters.locationCountryCode;
    }
    if (filters.remoteType?.length) {
      where.remoteType = { in: filters.remoteType };
    }
    if (filters.seniority?.length) {
      where.seniority = { in: filters.seniority };
    }
    if (filters.language) {
      where.language = filters.language;
    }
    if (filters.title) {
      where.jobTitleNormalized = { contains: filters.title, mode: 'insensitive' };
    }
    if (filters.stack?.length) {
      where.techStackTags = { hasSome: filters.stack };
    }
    if (filters.sourceType?.length) {
      where.rawJob = { source: { sourceType: { in: filters.sourceType } } };
    }
    if (filters.salaryMin) {
      // Soft-inclusive hard filter: exclude jobs whose listed max is below the
      // floor, but never exclude jobs that simply didn't list a salary —
      // most German postings omit it, and product principle is trust/value
      // over aggressive filtering.
      where.OR = [{ salaryMax: null }, { salaryMax: { gte: filters.salaryMin } }];
    }
    if (filters.query) {
      const queryConditions: Prisma.CanonicalJobWhereInput[] = [
        { jobTitleNormalized: { contains: filters.query, mode: 'insensitive' } },
        { companyNameNormalized: { contains: filters.query, mode: 'insensitive' } },
      ];
      where.AND = [{ OR: queryConditions }];
    }

    return where;
  }

  private async loadRankingProfile(userId?: string): Promise<RankingProfileInput | null> {
    if (!userId) return null;
    const profile = await this.prisma.client.candidateProfile.findUnique({ where: { userId } });
    return profile ? toRankingProfile(profile) : null;
  }

  /**
   * All of one user's like/skip interactions, keyed by canonical job id.
   *
   * Deliberately not filtered by the candidate ids being scored any more: that
   * `IN (...)` list was bounded by the old 200-row pool, but search() now
   * scores the whole filtered corpus, and passing ~13k ids per request would
   * cost far more than reading the handful of rows one user actually has.
   */
  private async loadInteractionBias(userId: string | undefined): Promise<Map<string, number>> {
    const bias = new Map<string, number>();
    if (!userId) return bias;

    const interactions = await this.prisma.client.jobInteraction.findMany({
      where: { userId },
      select: { canonicalJobId: true, interactionType: true },
    });
    for (const interaction of interactions) {
      if (interaction.interactionType === 'like') bias.set(interaction.canonicalJobId, 1);
      if (interaction.interactionType === 'skip') bias.set(interaction.canonicalJobId, -1);
    }
    return bias;
  }
}
