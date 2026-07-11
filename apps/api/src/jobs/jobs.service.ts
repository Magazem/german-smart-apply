import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createAiProvider } from '@german-smart-apply/ai';
import type { Prisma } from '@german-smart-apply/db';
import type { CanonicalJob, JobFeedbackType, JobMatchScore } from '@german-smart-apply/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { toSharedCandidateProfile } from '../profile/candidate-profile.mapper.js';
import { toSharedCanonicalJob } from './canonical-job.mapper.js';
import type { SearchJobsDto } from './dto/search-jobs.dto.js';
import { RankingService, type RankingProfileInput } from './ranking.service.js';

export interface RankedJobResult {
  job: CanonicalJob;
  score: JobMatchScore;
  myFeedback?: JobFeedbackType | null;
}

// Hard-filtered candidate pool size before in-app scoring/sorting. Fine at
// MVP scale (Postgres FTS/pgvector-backed search is a Phase 3 upgrade per
// plan.md); revisit if canonical_jobs grows large enough that this misses
// good matches outside the top `CANDIDATE_POOL_SIZE` most recent postings.
const CANDIDATE_POOL_SIZE = 200;
const DEFAULT_PAGE_SIZE = 20;

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  private readonly aiProvider = createAiProvider();

  constructor(
    private readonly prisma: PrismaService,
    private readonly ranking: RankingService,
  ) {}

  async search(filters: SearchJobsDto, userId?: string) {
    const where = this.buildWhere(filters);

    const candidates = await this.prisma.client.canonicalJob.findMany({
      where,
      include: { rawJob: { include: { source: true } } },
      orderBy: { postedAt: 'desc' },
      take: CANDIDATE_POOL_SIZE,
    });

    const rankingProfile = await this.loadRankingProfile(userId);
    const interactionBias = await this.loadInteractionBias(
      userId,
      candidates.map((c) => c.id),
    );

    const scored: RankedJobResult[] = candidates.map((record) => {
      const job = toSharedCanonicalJob(record);
      const score = this.ranking.score(job, {
        profile: rankingProfile,
        queryText: filters.query ?? filters.title,
        interactionBias: interactionBias.get(record.id),
      });
      return { job, score };
    });

    scored.sort((a, b) => b.score.totalScore - a.score.totalScore);

    const limit = filters.limit ?? DEFAULT_PAGE_SIZE;
    const offset = filters.offset ?? 0;

    return {
      total: scored.length,
      limit,
      offset,
      results: scored.slice(offset, offset + limit),
    };
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

    const rankingProfile: RankingProfileInput | null = profile
      ? {
          skills: profile.skills,
          targetRole: profile.targetRole,
          targetCountryCode: profile.targetCountryCode,
          preferredLanguage: profile.preferredLanguage,
          seniority: profile.seniority,
          locationPreference: profile.locationPreference,
          salaryTargetMin: profile.salaryTargetMin,
          salaryTargetMax: profile.salaryTargetMax,
        }
      : null;

    const score = this.ranking.score(job, { profile: rankingProfile });

    if (profile) {
      // The match explanation is a nice-to-have addition to an otherwise
      // complete response - a transient AI-provider failure (rate limit,
      // overload, etc.) shouldn't 500 the whole job-detail request.
      try {
        const explanationResult = await this.aiProvider.generateMatchExplanation(
          toSharedCandidateProfile(profile),
          job,
          profile.preferredLanguage,
        );
        score.explanation = explanationResult.text;
      } catch (err) {
        this.logger.warn(`Match explanation generation failed for job ${id}: ${String(err)}`);
      }
    }

    return { job, score, myFeedback };
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
    if (!profile) return null;
    return {
      skills: profile.skills,
      targetRole: profile.targetRole,
      targetCountryCode: profile.targetCountryCode,
      preferredLanguage: profile.preferredLanguage,
      seniority: profile.seniority,
      locationPreference: profile.locationPreference,
      salaryTargetMin: profile.salaryTargetMin,
      salaryTargetMax: profile.salaryTargetMax,
    };
  }

  private async loadInteractionBias(
    userId: string | undefined,
    canonicalJobIds: string[],
  ): Promise<Map<string, number>> {
    const bias = new Map<string, number>();
    if (!userId || canonicalJobIds.length === 0) return bias;

    const interactions = await this.prisma.client.jobInteraction.findMany({
      where: { userId, canonicalJobId: { in: canonicalJobIds } },
    });
    for (const interaction of interactions) {
      if (interaction.interactionType === 'like') bias.set(interaction.canonicalJobId, 1);
      if (interaction.interactionType === 'skip') bias.set(interaction.canonicalJobId, -1);
    }
    return bias;
  }
}
