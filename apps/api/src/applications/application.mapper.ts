import type {
  Application as PrismaApplication,
  ApplicationDraft as PrismaApplicationDraft,
} from '@german-smart-apply/db';
import type {
  Application,
  ApplicationDraft,
  ApplicationStatus,
} from '@german-smart-apply/shared';

/**
 * Maps the Prisma `Application` row onto the shared `Application` DTO shape.
 * Prisma's foreign key column is `canonicalJobId` (matches the CanonicalJob
 * model it references); the public contract - and packages/shared's
 * CanonicalJob.jobId convention that both the frontend and API code against -
 * calls it `jobId`. Callers must never return a raw Prisma row directly, or
 * clients see `canonicalJobId` instead of the `jobId` field they expect.
 */
export function toSharedApplication(record: PrismaApplication): Application {
  return {
    id: record.id,
    userId: record.userId,
    jobId: record.canonicalJobId,
    status: record.status as ApplicationStatus,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toSharedApplicationDraft(record: PrismaApplicationDraft): ApplicationDraft {
  return {
    id: record.id,
    applicationId: record.applicationId,
    cvVariantText: record.cvVariantText,
    coverLetterText: record.coverLetterText,
    modelUsed: record.modelUsed,
    tokensUsed: record.tokensUsed,
    createdAt: record.createdAt.toISOString(),
  };
}
