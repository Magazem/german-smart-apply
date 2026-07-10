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
import { toSharedApplication, toSharedApplicationDraft } from './application.mapper.js';
import type { CreateApplicationDto } from './dto/create-application.dto.js';
import type { UpdateStatusDto } from './dto/update-status.dto.js';

@Injectable()
export class ApplicationsService {
  private readonly aiProvider = createAiProvider();

  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const rows = await this.prisma.client.application.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(toSharedApplication);
  }

  async getOne(userId: string, applicationId: string) {
    const application = await this.getOwnedOrThrow(userId, applicationId);
    return toSharedApplication(application);
  }

  async getLatestDraft(userId: string, applicationId: string) {
    await this.getOwnedOrThrow(userId, applicationId);
    const draft = await this.prisma.client.applicationDraft.findFirst({
      where: { applicationId },
      orderBy: { createdAt: 'desc' },
    });
    if (!draft) {
      throw new NotFoundException('No draft generated for this application yet');
    }
    return toSharedApplicationDraft(draft);
  }

  async create(userId: string, dto: CreateApplicationDto) {
    const job = await this.prisma.client.canonicalJob.findFirst({
      where: { id: dto.jobId, isVisible: true },
    });
    if (!job) {
      throw new NotFoundException('Job not found');
    }

    const existing = await this.prisma.client.application.findUnique({
      where: { userId_canonicalJobId: { userId, canonicalJobId: dto.jobId } },
    });
    if (existing) {
      throw new ConflictException('An application for this job already exists');
    }

    const application = await this.prisma.client.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const created = await tx.application.create({
          data: { userId, canonicalJobId: dto.jobId, status: 'new' },
        });
        await tx.applicationEvent.create({
          data: {
            applicationId: created.id,
            fromStatus: null,
            toStatus: 'new',
            note: 'Application created',
          },
        });
        return created;
      },
    );
    return toSharedApplication(application);
  }

  async updateStatus(userId: string, applicationId: string, dto: UpdateStatusDto) {
    const application = await this.getOwnedOrThrow(userId, applicationId);

    if (!canTransition(application.status, dto.status)) {
      throw new ConflictException(
        `Cannot transition application from "${application.status}" to "${dto.status}"`,
      );
    }

    const updated = await this.prisma.client.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const result = await tx.application.update({
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
        return result;
      },
    );
    return toSharedApplication(updated);
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

    const draft = await this.prisma.client.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const created = await tx.applicationDraft.create({
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
        return created;
      },
    );
    return toSharedApplicationDraft(draft);
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
