import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AiProviderError, createAiProvider } from '@german-smart-apply/ai';
import type { Prisma } from '@german-smart-apply/db';
import { canTransition, type ApplicationStatus, type CvVariantStyle } from '@german-smart-apply/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { TokenUsageService } from '../token-usage/token-usage.service.js';
import { toSharedCandidateProfile } from '../profile/candidate-profile.mapper.js';
import { toSharedCanonicalJob } from '../jobs/canonical-job.mapper.js';
import {
  toSharedApplication,
  toSharedApplicationDraft,
  toSharedFollowUpDraft,
  toSharedInterviewPrepDraft,
} from './application.mapper.js';
import { buildApplicationPdf } from './application-pdf.js';
import type { CreateApplicationDto } from './dto/create-application.dto.js';
import type { UpdateStatusDto } from './dto/update-status.dto.js';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Statuses from which a candidate can plausibly still be waiting on a reply. */
const FOLLOW_UP_ELIGIBLE_STATUSES: ApplicationStatus[] = ['applied', 'interview'];

@Injectable()
export class ApplicationsService {
  private readonly logger = new Logger(ApplicationsService.name);
  private readonly aiProvider = createAiProvider();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenUsage: TokenUsageService,
  ) {}

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

  /** All generated variants for this application, most recent first - lets the UI compare/pick between them. */
  async listDrafts(userId: string, applicationId: string) {
    await this.getOwnedOrThrow(userId, applicationId);
    const drafts = await this.prisma.client.applicationDraft.findMany({
      where: { applicationId },
      orderBy: { createdAt: 'desc' },
    });
    return drafts.map(toSharedApplicationDraft);
  }

  /**
   * Renders a draft's CV + cover letter + job details as a downloadable PDF.
   * Defaults to the most recent draft; pass `draftId` to export a specific
   * variant instead (e.g. the one the user picked in the UI).
   */
  async generatePdf(userId: string, applicationId: string, draftId?: string) {
    const application = await this.getOwnedOrThrow(userId, applicationId);

    const draft = draftId
      ? await this.prisma.client.applicationDraft.findFirst({
          where: { id: draftId, applicationId },
        })
      : await this.prisma.client.applicationDraft.findFirst({
          where: { applicationId },
          orderBy: { createdAt: 'desc' },
        });
    if (!draft) {
      throw new NotFoundException('No draft found for this application');
    }

    const [user, profile, jobRecord] = await Promise.all([
      this.prisma.client.user.findUniqueOrThrow({ where: { id: userId } }),
      this.prisma.client.candidateProfile.findUnique({ where: { userId } }),
      this.prisma.client.canonicalJob.findFirst({
        where: { id: application.canonicalJobId },
        include: { rawJob: true },
      }),
    ]);
    if (!jobRecord) {
      throw new NotFoundException('Job not found');
    }

    return buildApplicationPdf(
      { fullName: profile?.fullName ?? null, email: user.email },
      {
        // Raw (as-originally-posted) casing, not the lowercased *Normalized
        // fields used internally for matching/dedup - this PDF is an
        // artifact the candidate sends to an employer, so it should read
        // like a real job title/company name, not a normalization key.
        jobTitle: jobRecord.rawJob.jobTitleRaw,
        companyName: jobRecord.rawJob.companyNameRaw,
        locationNormalized: jobRecord.locationNormalized,
        remoteType: jobRecord.remoteType,
        employmentType: jobRecord.employmentType,
        salaryMin: jobRecord.salaryMin,
        salaryMax: jobRecord.salaryMax,
        salaryCurrency: jobRecord.salaryCurrency,
        applyUrl: jobRecord.rawJob.applyUrl,
      },
      {
        cvVariantText: draft.cvVariantText,
        coverLetterText: draft.coverLetterText,
        variantLabel: draft.variantLabel,
        createdAt: draft.createdAt,
      },
    );
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

  async generateDraft(
    userId: string,
    applicationId: string,
    language?: string,
    variantStyle: CvVariantStyle = 'standard',
  ) {
    const application = await this.getOwnedOrThrow(userId, applicationId);
    const targetStatus: ApplicationStatus = 'draft_ready';

    if (!canTransition(application.status, targetStatus)) {
      throw new ConflictException(
        `Cannot generate a draft while application is in status "${application.status}". ` +
          `Mark it "viewed" or "saved" first.`,
      );
    }

    if (variantStyle !== 'standard') {
      const user = await this.prisma.client.user.findUniqueOrThrow({
        where: { id: userId },
        select: { subscriptionStatus: true },
      });
      if (user.subscriptionStatus !== 'pro') {
        throw new ForbiddenException(
          `The "${variantStyle}" variant style requires a Pro subscription - the standard style is free.`,
        );
      }
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

    let cvVariant, coverLetter;
    try {
      [cvVariant, coverLetter] = await Promise.all([
        this.aiProvider.generateCvVariant(sharedProfile, sharedJob, lang, variantStyle),
        this.aiProvider.generateCoverLetter(sharedProfile, sharedJob, lang, variantStyle),
      ]);
    } catch (err) {
      this.logger.error(`Draft generation failed for application ${applicationId}: ${String(err)}`);
      if (err instanceof AiProviderError) {
        throw new ServiceUnavailableException(
          'CV/cover-letter generation is temporarily unavailable - please try again shortly.',
        );
      }
      throw err;
    }

    await Promise.all([
      this.tokenUsage.record(userId, 'cvVariant', cvVariant.modelUsed, cvVariant.tokensUsed),
      this.tokenUsage.record(userId, 'coverLetter', coverLetter.modelUsed, coverLetter.tokensUsed),
    ]);

    const draft = await this.prisma.client.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const created = await tx.applicationDraft.create({
          data: {
            applicationId,
            cvVariantText: cvVariant.text,
            coverLetterText: coverLetter.text,
            variantLabel: variantStyle,
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

  /** Every generated follow-up email for this application, most recent first. */
  async listFollowUps(userId: string, applicationId: string) {
    await this.getOwnedOrThrow(userId, applicationId);
    const followUps = await this.prisma.client.followUpDraft.findMany({
      where: { applicationId },
      orderBy: { createdAt: 'desc' },
    });
    return followUps.map(toSharedFollowUpDraft);
  }

  /**
   * Drafts a follow-up email the candidate can review and send themselves -
   * this never sends anything on the candidate's behalf, same "explicit
   * approval, never auto-apply" principle as the rest of the app.
   */
  async generateFollowUp(userId: string, applicationId: string, language?: string) {
    const application = await this.getOwnedOrThrow(userId, applicationId);

    if (!FOLLOW_UP_ELIGIBLE_STATUSES.includes(application.status as ApplicationStatus)) {
      throw new ConflictException(
        `Cannot draft a follow-up while application is in status "${application.status}". ` +
          'A follow-up only makes sense once the application has actually been applied.',
      );
    }

    const profile = await this.prisma.client.candidateProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new BadRequestException('Complete your candidate profile before drafting a follow-up');
    }

    const jobRecord = await this.prisma.client.canonicalJob.findFirst({
      where: { id: application.canonicalJobId },
      include: { rawJob: { include: { source: true } } },
    });
    if (!jobRecord) {
      throw new NotFoundException('Job not found');
    }

    const appliedEvent = await this.prisma.client.applicationEvent.findFirst({
      where: { applicationId, toStatus: 'applied' },
      orderBy: { createdAt: 'asc' },
    });
    const since = appliedEvent?.createdAt ?? application.createdAt;
    const daysSinceApplied = Math.max(0, Math.floor((Date.now() - since.getTime()) / MS_PER_DAY));

    const sharedProfile = toSharedCandidateProfile(profile);
    const sharedJob = toSharedCanonicalJob(jobRecord);
    const lang = language ?? profile.preferredLanguage;

    let followUp;
    try {
      followUp = await this.aiProvider.generateFollowUpEmail(sharedProfile, sharedJob, lang, daysSinceApplied);
    } catch (err) {
      this.logger.error(`Follow-up generation failed for application ${applicationId}: ${String(err)}`);
      if (err instanceof AiProviderError) {
        throw new ServiceUnavailableException(
          'Follow-up email generation is temporarily unavailable - please try again shortly.',
        );
      }
      throw err;
    }

    await this.tokenUsage.record(userId, 'followUpEmail', followUp.modelUsed, followUp.tokensUsed);

    const created = await this.prisma.client.followUpDraft.create({
      data: {
        applicationId,
        subject: followUp.subject,
        body: followUp.body,
        modelUsed: followUp.modelUsed,
        tokensUsed: followUp.tokensUsed,
      },
    });
    return toSharedFollowUpDraft(created);
  }

  /** Every generated interview-prep draft for this application, most recent first. */
  async listInterviewPreps(userId: string, applicationId: string) {
    await this.getOwnedOrThrow(userId, applicationId);
    const preps = await this.prisma.client.interviewPrepDraft.findMany({
      where: { applicationId },
      orderBy: { createdAt: 'desc' },
    });
    return preps.map(toSharedInterviewPrepDraft);
  }

  /**
   * Generates likely interview questions and talking points for this
   * application's job. Purely informational research material for the
   * candidate to review - unlike follow-ups, there's no "sent on your
   * behalf" concern, so this isn't gated to any particular status: it's
   * useful research prep from the moment a job is on the candidate's radar.
   */
  async generateInterviewPrep(userId: string, applicationId: string, language?: string) {
    const application = await this.getOwnedOrThrow(userId, applicationId);

    const profile = await this.prisma.client.candidateProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new BadRequestException('Complete your candidate profile before generating interview prep');
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

    let prep;
    try {
      prep = await this.aiProvider.generateInterviewPrep(sharedProfile, sharedJob, lang);
    } catch (err) {
      this.logger.error(`Interview prep generation failed for application ${applicationId}: ${String(err)}`);
      if (err instanceof AiProviderError) {
        throw new ServiceUnavailableException(
          'Interview prep generation is temporarily unavailable - please try again shortly.',
        );
      }
      throw err;
    }

    await this.tokenUsage.record(userId, 'interviewPrep', prep.modelUsed, prep.tokensUsed);

    const created = await this.prisma.client.interviewPrepDraft.create({
      data: {
        applicationId,
        questions: prep.questions,
        talkingPoints: prep.talkingPoints,
        modelUsed: prep.modelUsed,
        tokensUsed: prep.tokensUsed,
      },
    });
    return toSharedInterviewPrepDraft(created);
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
