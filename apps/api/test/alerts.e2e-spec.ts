import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, type TestApp } from './test-app.js';
import { createJobFixture, deleteJobFixture, uniqueEmail } from './fixtures.js';

const UNIQUE_TITLE = 'Zzyzx Quantum Falafel Engineer';

describe('Alerts (e2e)', () => {
  let app: INestApplication;
  let prisma: TestApp['prisma'];
  let userToken: string;
  let userId: string;
  let adminToken: string;
  let adminId: string;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.prisma;

    const userRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: uniqueEmail('alerts-owner'), password: 'Correct-Horse9-Battery', acceptedTerms: true, acceptedPolicyVersion: '1.0' });
    userToken = userRes.body.accessToken;
    userId = userRes.body.user.id;

    const adminRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: uniqueEmail('alerts-admin'), password: 'Correct-Horse9-Battery', acceptedTerms: true, acceptedPolicyVersion: '1.0' });
    adminToken = adminRes.body.accessToken;
    adminId = adminRes.body.user.id;
    await prisma.client.user.update({ where: { id: adminId }, data: { role: 'admin' } });
  });

  afterAll(async () => {
    await prisma.client.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.client.user.delete({ where: { id: adminId } }).catch(() => undefined);
    await app.close();
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer()).post('/admin/alerts/run').expect(401);
  });

  it('rejects a non-admin user with 403', async () => {
    await request(app.getHttpServer())
      .post('/admin/alerts/run')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
  });

  it('emails the owner and records a delivery when a new job matches an active saved search', async () => {
    const savedSearchRes = await request(app.getHttpServer())
      .post('/saved-searches')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'Falafel roles', filters: { title: UNIQUE_TITLE } })
      .expect(201);
    const savedSearchId = savedSearchRes.body.id;

    // Created strictly after the saved search, so it's a "new" match.
    const job = await createJobFixture(prisma, { jobTitle: UNIQUE_TITLE });

    const runRes = await request(app.getHttpServer())
      .post('/admin/alerts/run')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    expect(runRes.body.emailsSent).toBeGreaterThanOrEqual(1);
    expect(runRes.body.totalJobsMatched).toBeGreaterThanOrEqual(1);

    const deliveries = await prisma.client.alertDelivery.findMany({ where: { savedSearchId } });
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].channel).toBe('email');
    expect(deliveries[0].jobIds).toContain(job.canonicalJob.id);

    await deleteJobFixture(prisma, job.source.id);
    await request(app.getHttpServer())
      .delete(`/saved-searches/${savedSearchId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
  });

  it('does not re-notify on the same job on a second run (delivery cursor advances)', async () => {
    const savedSearchRes = await request(app.getHttpServer())
      .post('/saved-searches')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'Falafel roles 2', filters: { title: UNIQUE_TITLE } })
      .expect(201);
    const savedSearchId = savedSearchRes.body.id;

    const job = await createJobFixture(prisma, { jobTitle: UNIQUE_TITLE });

    await request(app.getHttpServer())
      .post('/admin/alerts/run')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    const afterFirstRun = await prisma.client.alertDelivery.count({ where: { savedSearchId } });
    expect(afterFirstRun).toBe(1);

    await request(app.getHttpServer())
      .post('/admin/alerts/run')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    const afterSecondRun = await prisma.client.alertDelivery.count({ where: { savedSearchId } });
    // No new job arrived between the two runs, so no second delivery.
    expect(afterSecondRun).toBe(1);

    await deleteJobFixture(prisma, job.source.id);
    await request(app.getHttpServer())
      .delete(`/saved-searches/${savedSearchId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
  });

  it('skips an inactive saved search entirely, even with a matching new job', async () => {
    const savedSearchRes = await request(app.getHttpServer())
      .post('/saved-searches')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'Falafel roles (paused)', filters: { title: UNIQUE_TITLE }, isActive: false })
      .expect(201);
    const savedSearchId = savedSearchRes.body.id;

    const job = await createJobFixture(prisma, { jobTitle: UNIQUE_TITLE });

    await request(app.getHttpServer())
      .post('/admin/alerts/run')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    const deliveries = await prisma.client.alertDelivery.count({ where: { savedSearchId } });
    expect(deliveries).toBe(0);

    await deleteJobFixture(prisma, job.source.id);
    await request(app.getHttpServer())
      .delete(`/saved-searches/${savedSearchId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
  });

  it('does not send or record a delivery when nothing matches', async () => {
    const savedSearchRes = await request(app.getHttpServer())
      .post('/saved-searches')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'Nonexistent role', filters: { title: 'Totally Nonexistent Role Xyzzy123' } })
      .expect(201);
    const savedSearchId = savedSearchRes.body.id;

    await request(app.getHttpServer())
      .post('/admin/alerts/run')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    const deliveries = await prisma.client.alertDelivery.count({ where: { savedSearchId } });
    expect(deliveries).toBe(0);

    await request(app.getHttpServer())
      .delete(`/saved-searches/${savedSearchId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
  });
});
