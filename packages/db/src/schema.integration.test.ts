import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrismaClient } from './index.js';

const prisma = getPrismaClient();

describe('schema integration', () => {
  let sourceId: string;
  let rawJobId: string;
  let canonicalJobId: string;
  let userId: string;

  beforeAll(async () => {
    const source = await prisma.source.create({
      data: {
        sourceType: 'greenhouse',
        displayName: 'Test Source',
        countryCode: 'DE',
        trustTier: 'high',
      },
    });
    sourceId = source.id;

    const rawJob = await prisma.rawJob.create({
      data: {
        sourceId,
        originalJobId: 'ext-123',
        sourceUrl: 'https://example.com/jobs/123',
        companyNameRaw: 'Acme GmbH',
        companyNameNormalized: 'acme gmbh',
        jobTitleRaw: 'Senior Backend Engineer',
        jobTitleNormalized: 'senior backend engineer',
        jobDescriptionText: 'Build things.',
        language: 'en',
        locationRaw: 'Berlin',
        locationNormalized: 'Berlin',
        countryCode: 'DE',
        remoteType: 'hybrid',
        employmentType: 'full_time',
        applyUrl: 'https://example.com/apply/123',
      },
    });
    rawJobId = rawJob.id;

    const canonicalJob = await prisma.canonicalJob.create({
      data: {
        rawJobId,
        companyNameNormalized: 'acme gmbh',
        jobTitleNormalized: 'senior backend engineer',
        locationNormalized: 'Berlin',
        countryCode: 'DE',
        remoteType: 'hybrid',
        employmentType: 'full_time',
        language: 'en',
        sourceTrustScore: 0.9,
        scamRiskScore: 0.05,
        crawledAt: new Date(),
      },
    });
    canonicalJobId = canonicalJob.id;

    const user = await prisma.user.create({
      data: { email: `test-${Date.now()}@example.com` },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.application.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.canonicalJob.deleteMany({ where: { id: canonicalJobId } });
    await prisma.rawJob.deleteMany({ where: { id: rawJobId } });
    await prisma.source.deleteMany({ where: { id: sourceId } });
    await prisma.$disconnect();
  });

  it('links raw job to its canonical job one-to-one', async () => {
    const rawJob = await prisma.rawJob.findUniqueOrThrow({
      where: { id: rawJobId },
      include: { canonicalJob: true },
    });
    expect(rawJob.canonicalJob?.id).toBe(canonicalJobId);
  });

  it('enforces one application per user per canonical job (unique constraint)', async () => {
    await prisma.application.create({ data: { userId, canonicalJobId } });
    await expect(
      prisma.application.create({ data: { userId, canonicalJobId } }),
    ).rejects.toThrow();
  });

  it('cascades application deletion when the user is deleted', async () => {
    const otherUser = await prisma.user.create({
      data: { email: `cascade-${Date.now()}@example.com` },
    });
    const app = await prisma.application.create({
      data: { userId: otherUser.id, canonicalJobId },
    });
    await prisma.user.delete({ where: { id: otherUser.id } });
    const found = await prisma.application.findUnique({ where: { id: app.id } });
    expect(found).toBeNull();
  });

  it('defaults new applications to the new status', async () => {
    const app = await prisma.application.findFirstOrThrow({ where: { userId, canonicalJobId } });
    expect(app.status).toBe('new');
  });
});
