import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { AiProviderError } from '@german-smart-apply/ai';
import { AiProviderFactory } from '../ai/ai-provider-factory.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TokenUsageService } from '../token-usage/token-usage.service.js';
import { toSharedCandidateProfile } from '../profile/candidate-profile.mapper.js';
import { toSharedCanonicalJob } from '../jobs/canonical-job.mapper.js';
import { toSharedRoleGapAnalysis } from './role-gap-analysis.mapper.js';
import type { CreateRoleGapAnalysisDto } from './dto/create-role-gap-analysis.dto.js';

// How many matching postings feed the deterministic tag-frequency count.
// Bigger than SAMPLE_JOB_LIMIT on purpose: frequency should reflect the
// broader market, not just the handful of full descriptions sent to the model.
const CANDIDATE_POOL_SIZE = 50;

// How many full job descriptions get sent to the model verbatim - kept small
// so token cost stays bounded regardless of CANDIDATE_POOL_SIZE.
const SAMPLE_JOB_LIMIT = 5;

@Injectable()
export class RoleGapAnalysisService {
  private readonly logger = new Logger(RoleGapAnalysisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenUsage: TokenUsageService,
    private readonly aiProviderFactory: AiProviderFactory,
  ) {}

  async list(userId: string) {
    const rows = await this.prisma.client.roleGapAnalysis.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toSharedRoleGapAnalysis);
  }

  async create(userId: string, dto: CreateRoleGapAnalysisDto) {
    const profile = await this.prisma.client.candidateProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new BadRequestException('Complete your candidate profile before running a role gap analysis');
    }

    const candidateRecords = await this.prisma.client.canonicalJob.findMany({
      where: {
        isVisible: true,
        jobTitleNormalized: { contains: dto.targetRole.toLowerCase(), mode: 'insensitive' },
      },
      include: { rawJob: { include: { source: true } } },
      orderBy: { postedAt: 'desc' },
      take: CANDIDATE_POOL_SIZE,
    });

    const candidateJobs = candidateRecords.map(toSharedCanonicalJob);
    const sampleJobs = candidateJobs.slice(0, SAMPLE_JOB_LIMIT);

    const tagFrequency: Record<string, number> = {};
    for (const job of candidateJobs) {
      for (const tag of job.techStackTags) {
        tagFrequency[tag] = (tagFrequency[tag] ?? 0) + 1;
      }
    }

    const sharedProfile = toSharedCandidateProfile(profile);
    const lang = dto.language ?? profile.preferredLanguage;

    let analysis;
    try {
      const aiProvider = await this.aiProviderFactory.getProvider();
      analysis = await aiProvider.generateRoleGapAnalysis(
        sharedProfile,
        { targetRole: dto.targetRole, sampleJobs, tagFrequency },
        lang,
      );
    } catch (err) {
      this.logger.error(`Role gap analysis failed for user ${userId}: ${String(err)}`);
      if (err instanceof AiProviderError) {
        throw new ServiceUnavailableException(
          'Role gap analysis is temporarily unavailable - please try again shortly.',
        );
      }
      throw err;
    }

    await this.tokenUsage.record(userId, 'roleGapAnalysis', analysis.modelUsed, analysis.tokensUsed);

    const created = await this.prisma.client.roleGapAnalysis.create({
      data: {
        userId,
        targetRole: dto.targetRole,
        matchingSkills: analysis.matchingSkills,
        missingSkills: analysis.missingSkills,
        suggestedLearningTopics: analysis.suggestedLearningTopics,
        suggestedCertifications: analysis.suggestedCertifications,
        estimatedReadinessScore: Math.round(analysis.estimatedReadinessScore),
        summary: analysis.summary,
        sampleJobCount: candidateJobs.length,
        modelUsed: analysis.modelUsed,
        tokensUsed: analysis.tokensUsed,
      },
    });
    return toSharedRoleGapAnalysis(created);
  }
}
