import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createAiProvider } from '@german-smart-apply/ai';
import type { Prisma } from '@german-smart-apply/db';
import type { CanonicalJob, JobMatchScore } from '@german-smart-apply/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { toSharedCandidateProfile } from '../profile/candidate-profile.mapper.js';
import { toSharedCanonicalJob } from './canonical-job.mapper.js';
import type { SearchJobsDto } from './dto/search-jobs.dto.js';
import { RankingService, type RankingProfileInput } from './ranking.service.js';

export interface RankedJobResult {
  job: CanonicalJob;
  score: JobMatchScore;
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
    const record = await this.prisma.client.canonicalJob.findFirst({
      where: { id, isVisible: true },
      include: { rawJob: { include: { source: true } } },
    });
    if (!record) {
      throw new NotFoundException('Job not found');
    }

    const job = toSharedCanonicalJob(record);
    const profile = userId
      ? await this.prisma.client.candidateProfile.findUnique({ where: { userId } })
      : null;

    if (userId) {
      await this.prisma.client.jobInteraction
        .create({ data: { userId, canonicalJobId: id, interactionType: 'view' } })
        .catch(() => undefined);
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

    return { job, score };
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
