import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, type TestApp } from './test-app.js';
import { createJobFixture, deleteJobFixture, uniqueEmail } from './fixtures.js';

describe('Admin source health (e2e)', () => {
  let app: INestApplication;
  let prisma: TestApp['prisma'];
  let userToken: string;
  let userId: string;
  let adminToken: string;
  let adminId: string;
  let sourceId: string;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.prisma;

    const userRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: uniqueEmail('admin-regular'), password: 'Correct-Horse9-Battery', acceptedTerms: true, acceptedPolicyVersion: '1.0' });
    userToken = userRes.body.accessToken;
    userId = userRes.body.user.id;

    const adminRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: uniqueEmail('admin-promoted'), password: 'Correct-Horse9-Battery', acceptedTerms: true, acceptedPolicyVersion: '1.0' });
    adminToken = adminRes.body.accessToken;
    adminId = adminRes.body.user.id;
    // Promotion has no self-serve endpoint by design (same as there's no
    // self-serve path to Pro without Stripe) - a direct DB update is the
    // real-world mechanism, so it's also the correct way to simulate it here.
    await prisma.client.user.update({ where: { id: adminId }, data: { role: 'admin' } });

    const source = await prisma.client.source.create({
      data: {
        sourceType: 'test-source',
        displayName: 'Test Source',
        countryCode: 'DE',
        trustTier: 'medium',
      },
    });
    sourceId = source.id;
    await prisma.client.sourceCrawlRun.createMany({
      data: [
        { sourceId, status: 'success', startedAt: new Date('2026-07-10T08:00:00Z'), finishedAt: new Date('2026-07-10T08:05:00Z'), jobsFetched: 40, jobsNew: 5, jobsUpdated: 35 },
        { sourceId, status: 'failure', startedAt: new Date('2026-07-09T08:00:00Z'), finishedAt: new Date('2026-07-09T08:01:00Z'), errorLog: 'Timed out' },
        { sourceId, status: 'success', startedAt: new Date('2026-07-08T08:00:00Z'), finishedAt: new Date('2026-07-08T08:05:00Z'), jobsFetched: 38, jobsNew: 2, jobsUpdated: 36 },
      ],
    });
  });

  afterAll(async () => {
    await prisma.client.sourceCrawlRun.deleteMany({ where: { sourceId } }).catch(() => undefined);
    await prisma.client.source.delete({ where: { id: sourceId } }).catch(() => undefined);
    await prisma.client.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.client.user.delete({ where: { id: adminId } }).catch(() => undefined);
    await app.close();
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer()).get('/admin/sources').expect(401);
  });

  it('rejects a regular (non-admin) user with 403', async () => {
    await request(app.getHttpServer())
      .get('/admin/sources')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
  });

  it('returns source health with success rate for an admin', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/sources')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const testSource = res.body.find((s: { id: string }) => s.id === sourceId);
    expect(testSource).toBeTruthy();
    expect(testSource.displayName).toBe('Test Source');
    // 2 success out of 3 completed runs.
    expect(testSource.successRate).toBeCloseTo(2 / 3);
    expect(testSource.recentRunCount).toBe(3);
    expect(testSource.lastRun.status).toBe('success');
    expect(testSource.lastRun.startedAt).toContain('2026-07-10');
  });

  it('returns null successRate for a source with no completed runs', async () => {
    const freshSource = await prisma.client.source.create({
      data: { sourceType: 'fresh-source', displayName: 'Fresh Source', countryCode: 'DE', trustTier: 'low' },
    });
    const res = await request(app.getHttpServer())
      .get('/admin/sources')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const fresh = res.body.find((s: { id: string }) => s.id === freshSource.id);
    expect(fresh.successRate).toBeNull();
    expect(fresh.lastRun).toBeNull();
    await prisma.client.source.delete({ where: { id: freshSource.id } });
  });

  it('rejects a regular user on the run-history endpoint too', async () => {
    await request(app.getHttpServer())
      .get(`/admin/sources/${sourceId}/runs`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
  });

  it('returns full run history for an admin, most recent first', async () => {
    const res = await request(app.getHttpServer())
      .get(`/admin/sources/${sourceId}/runs`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.source.id).toBe(sourceId);
    expect(res.body.runs).toHaveLength(3);
    expect(res.body.runs[0].status).toBe('success');
    expect(res.body.runs[0].startedAt).toContain('2026-07-10');
    expect(res.body.runs[2].startedAt).toContain('2026-07-08');
  });

  it('404s for a source that does not exist', async () => {
    await request(app.getHttpServer())
      .get('/admin/sources/00000000-0000-0000-0000-000000000000/runs')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  describe('dedup-stats', () => {
    it('rejects a regular user with 403', async () => {
      await request(app.getHttpServer())
        .get('/admin/dedup-stats')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('counts exact-match and near-duplicate clusters separately, and hidden-by-duplication canonical jobs', async () => {
      // Snapshot first - this table is shared across every e2e file running
      // against the same local Postgres, so asserting deltas (not absolute
      // counts) is what keeps this test correct without cross-file cleanup
      // coordination.
      const before = await request(app.getHttpServer())
        .get('/admin/dedup-stats')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // One exact-match cluster (bare sha256-style key, as dedup.py writes)...
      const exactWinner = await createJobFixture(prisma, { jobTitle: 'Exact Dup Winner' });
      const exactLoser = await createJobFixture(prisma, { jobTitle: 'Exact Dup Loser' });
      const exactCluster = await prisma.client.duplicateCluster.create({
        data: { canonicalJobId: exactWinner.canonicalJob.id, clusterKey: 'deadbeef'.repeat(8) },
      });
      await prisma.client.duplicateClusterMember.createMany({
        data: [
          { duplicateClusterId: exactCluster.id, rawJobId: exactWinner.rawJob.id, similarityScore: 1.0, isCanonicalPick: true },
          { duplicateClusterId: exactCluster.id, rawJobId: exactLoser.rawJob.id, similarityScore: 1.0, isCanonicalPick: false },
        ],
      });
      await prisma.client.canonicalJob.update({ where: { id: exactLoser.canonicalJob.id }, data: { isVisible: false } });

      // ...and one near-dup cluster (near-dup:-prefixed key, as near_duplicates.py writes).
      const nearWinner = await createJobFixture(prisma, { jobTitle: 'Near Dup Winner' });
      const nearLoser = await createJobFixture(prisma, { jobTitle: 'Near Dup Loser' });
      const nearCluster = await prisma.client.duplicateCluster.create({
        data: { canonicalJobId: nearWinner.canonicalJob.id, clusterKey: `near-dup:${nearWinner.canonicalJob.id}:${nearLoser.canonicalJob.id}` },
      });
      await prisma.client.duplicateClusterMember.createMany({
        data: [
          { duplicateClusterId: nearCluster.id, rawJobId: nearWinner.rawJob.id, similarityScore: 1.0, isCanonicalPick: true },
          { duplicateClusterId: nearCluster.id, rawJobId: nearLoser.rawJob.id, similarityScore: 0.87, isCanonicalPick: false },
        ],
      });
      await prisma.client.canonicalJob.update({ where: { id: nearLoser.canonicalJob.id }, data: { isVisible: false } });

      const after = await request(app.getHttpServer())
        .get('/admin/dedup-stats')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(after.body.totalRawJobs - before.body.totalRawJobs).toBe(4);
      expect(after.body.totalCanonicalJobs - before.body.totalCanonicalJobs).toBe(4);
      expect(after.body.visibleCanonicalJobs - before.body.visibleCanonicalJobs).toBe(2);
      expect(after.body.hiddenByDuplication - before.body.hiddenByDuplication).toBe(2);
      expect(after.body.totalDuplicateClusters - before.body.totalDuplicateClusters).toBe(2);
      expect(after.body.exactDuplicateClusters - before.body.exactDuplicateClusters).toBe(1);
      expect(after.body.nearDuplicateClusters - before.body.nearDuplicateClusters).toBe(1);
      expect(after.body.totalDuplicateClusterMembers - before.body.totalDuplicateClusterMembers).toBe(4);

      await deleteJobFixture(prisma, exactWinner.source.id);
      await deleteJobFixture(prisma, exactLoser.source.id);
      await deleteJobFixture(prisma, nearWinner.source.id);
      await deleteJobFixture(prisma, nearLoser.source.id);
    });
  });

  describe('analytics', () => {
    it('rejects a regular user with 403', async () => {
      await request(app.getHttpServer())
        .get('/admin/analytics')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('reflects new signups, subscription tiers, and application statuses (as deltas, since this table is shared across e2e files)', async () => {
      const before = await request(app.getHttpServer())
        .get('/admin/analytics')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const freeRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: uniqueEmail('analytics-free'), password: 'Correct-Horse9-Battery', acceptedTerms: true, acceptedPolicyVersion: '1.0' });
      const proRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: uniqueEmail('analytics-pro'), password: 'Correct-Horse9-Battery', acceptedTerms: true, acceptedPolicyVersion: '1.0' });
      await prisma.client.user.update({
        where: { id: proRes.body.user.id },
        data: { subscriptionStatus: 'pro' },
      });

      const fixture = await createJobFixture(prisma, { jobTitle: 'Analytics Test Role' });
      const created = await request(app.getHttpServer())
        .post('/applications')
        .set('Authorization', `Bearer ${freeRes.body.accessToken}`)
        .send({ jobId: fixture.canonicalJob.id })
        .expect(201);
      // Drive straight to "applied" via PATCH /status (no profile needed - see
      // the equivalent trick in applications.e2e-spec.ts's follow-up tests).
      for (const status of ['viewed', 'draft_ready', 'awaiting_approval', 'applied']) {
        await request(app.getHttpServer())
          .patch(`/applications/${created.body.id}/status`)
          .set('Authorization', `Bearer ${freeRes.body.accessToken}`)
          .send({ status })
          .expect(200);
      }

      const after = await request(app.getHttpServer())
        .get('/admin/analytics')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(after.body.userCounts.total - before.body.userCounts.total).toBe(2);
      expect(after.body.userCounts.free - before.body.userCounts.free).toBe(1);
      expect(after.body.userCounts.pro - before.body.userCounts.pro).toBe(1);
      expect(after.body.applicationFunnel.applied - before.body.applicationFunnel.applied).toBe(1);
      expect(after.body.signupsLast30Days - before.body.signupsLast30Days).toBe(2);
      expect(after.body.tokenUsage).toEqual(expect.objectContaining({ totalTokens: expect.any(Number) }));

      await deleteJobFixture(prisma, fixture.source.id);
      await prisma.client.user.delete({ where: { id: freeRes.body.user.id } }).catch(() => undefined);
      await prisma.client.user.delete({ where: { id: proRes.body.user.id } }).catch(() => undefined);
    });
  });
});
