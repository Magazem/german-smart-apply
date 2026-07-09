import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createAiProvider } from '@german-smart-apply/ai';
import type { Prisma } from '@german-smart-apply/db';
import { canTransition, type ApplicationStatus } from '@german-smart-apply/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { toSharedCandidateProfile } from '../profile/candidate-profile.mapper.js';
import { toSharedCanonicalJob } from '../jobs/canonical-job.mapper.js';
import type { CreateApplicationDto } from './dto/create-application.dto.js';
import type { UpdateStatusDto } from './dto/update-status.dto.js';

@Injectable()
export class ApplicationsService {
  private readonly aiProvider = createAiProvider();

  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    return this.prisma.client.application.findMany({
      where: { userId },
      include: {
        canonicalJob: { include: { rawJob: { include: { source: true } } } },
        drafts: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async create(userId: string, dto: CreateApplicationDto) {
    const job = await this.prisma.client.canonicalJob.findFirst({
      where: { id: dto.canonicalJobId, isVisible: true },
    });
    if (!job) {
      throw new NotFoundException('Job not found');
    }

    const existing = await this.prisma.client.application.findUnique({
      where: { userId_canonicalJobId: { userId, canonicalJobId: dto.canonicalJobId } },
    });
    if (existing) {
      throw new ConflictException('An application for this job already exists');
    }

    return this.prisma.client.$transaction(async (tx: Prisma.TransactionClient) => {
      const application = await tx.application.create({
        data: { userId, canonicalJobId: dto.canonicalJobId, status: 'new' },
      });
      await tx.applicationEvent.create({
        data: {
          applicationId: application.id,
          fromStatus: null,
          toStatus: 'new',
          note: 'Application created',
        },
      });
      return application;
    });
  }

  async updateStatus(userId: string, applicationId: string, dto: UpdateStatusDto) {
    const application = await this.getOwnedOrThrow(userId, applicationId);

    if (!canTransition(application.status, dto.status)) {
      throw new ConflictException(
        `Cannot transition application from "${application.status}" to "${dto.status}"`,
      );
    }

    return this.prisma.client.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.application.update({
        where: { id: applicationId },
        data: { status: dto.status },
      });
      await tx.applicationEvent.create({
        data: {
          applicationId,
          fromStatus: application.status,
          toStatus: dto.status,
          note: dto.note ?? null,
        },
      });
      return updated;
    });
  }

  async generateDraft(userId: string, applicationId: string, language?: string) {
    const application = await this.getOwnedOrThrow(userId, applicationId);
    const targetStatus: ApplicationStatus = 'draft_ready';

    if (!canTransition(application.status, targetStatus)) {
      throw new ConflictException(
        `Cannot generate a draft while application is in status "${application.status}". ` +
          `Mark it "viewed" or "saved" first.`,
      );
    }

    const profile = await this.prisma.client.candidateProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new BadRequestException('Complete your candidate profile before generating a draft');
    }

    const jobRecord = await this.prisma.client.canonicalJob.findFirst({
      where: { id: application.canonicalJobId },
      include: { rawJob: { include: { source: true } } },
    });
    if (!jobRecord) {
      throw new NotFoundException('Job not found');
    }

    const sharedProfile = toSharedCandidateProfile(profile);
    const sharedJob = toSharedCanonicalJob(jobRecord);
    const lang = language ?? profile.preferredLanguage;

    const [cvVariant, coverLetter] = await Promise.all([
      this.aiProvider.generateCvVariant(sharedProfile, sharedJob, lang),
      this.aiProvider.generateCoverLetter(sharedProfile, sharedJob, lang),
    ]);

    return this.prisma.client.$transaction(async (tx: Prisma.TransactionClient) => {
      const draft = await tx.applicationDraft.create({
        data: {
          applicationId,
          cvVariantText: cvVariant.text,
          coverLetterText: coverLetter.text,
          modelUsed: cvVariant.modelUsed,
          tokensUsed: cvVariant.tokensUsed + coverLetter.tokensUsed,
        },
      });
      await tx.application.update({
        where: { id: applicationId },
        data: { status: targetStatus },
      });
      await tx.applicationEvent.create({
        data: {
          applicationId,
          fromStatus: application.status,
          toStatus: targetStatus,
          note: 'Draft generated',
        },
      });
      return draft;
    });
  }

  private async getOwnedOrThrow(userId: string, applicationId: string) {
    const application = await this.prisma.client.application.findUnique({
      where: { id: applicationId },
    });
    if (!application || application.userId !== userId) {
      throw new NotFoundException('Application not found');
    }
    return application;
  }
}
