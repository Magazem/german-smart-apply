import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, type TestApp } from './test-app.js';
import { createJobFixture, deleteJobFixture, uniqueEmail } from './fixtures.js';

describe('Applications workflow (e2e)', () => {
  let app: INestApplication;
  let prisma: TestApp['prisma'];
  let accessToken: string;
  let userId: string;
  let sourceId: string;
  let jobId: string;
  let applicationId: string;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.prisma;

    const email = uniqueEmail('applications');
    const authRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'correct-horse-battery-staple' });
    accessToken = authRes.body.accessToken;
    userId = authRes.body.user.id;

    await request(app.getHttpServer())
      .put('/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        targetRole: 'Backend Engineer',
        targetCountryCode: 'DE',
        preferredLanguage: 'en',
        seniority: 'senior',
        locationPreference: 'hybrid',
        skills: ['typescript', 'node'],
      })
      .expect(200);

    const fixture = await createJobFixture(prisma, { jobTitle: 'Platform Engineer' });
    sourceId = fixture.source.id;
    jobId = fixture.canonicalJob.id;
  });

  afterAll(async () => {
    await deleteJobFixture(prisma, sourceId);
    await prisma.client.user.delete({ where: { id: userId } }).catch(() => undefined);
    await app.close();
  });

  it('requires auth on every applications route', async () => {
    await request(app.getHttpServer()).get('/applications').expect(401);
    await request(app.getHttpServer()).post('/applications').send({ jobId }).expect(401);
    await request(app.getHttpServer())
      .patch('/applications/does-not-matter/status')
      .send({ status: 'viewed' })
      .expect(401);
  });

  it('creates an application starting in status "new"', async () => {
    const res = await request(app.getHttpServer())
      .post('/applications')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ jobId })
      .expect(201);

    expect(res.body.status).toBe('new');
    applicationId = res.body.id;
  });

  it('rejects creating a duplicate application for the same job', async () => {
    await request(app.getHttpServer())
      .post('/applications')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ jobId })
      .expect(409);
  });

  it('rejects an illegal status transition (new -> applied)', async () => {
    await request(app.getHttpServer())
      .patch(`/applications/${applicationId}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'applied' })
      .expect(409);
  });

  it('rejects generating a draft before the application has been viewed/saved', async () => {
    await request(app.getHttpServer())
      .post(`/applications/${applicationId}/draft`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(409);
  });

  it('allows the legal transition new -> viewed', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/applications/${applicationId}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'viewed', note: 'Opened the job detail page' })
      .expect(200);
    expect(res.body.status).toBe('viewed');
  });

  it('generates a CV variant + cover letter draft and moves status to draft_ready', async () => {
    const res = await request(app.getHttpServer())
      .post(`/applications/${applicationId}/draft`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(201);

    expect(res.body.cvVariantText).toEqual(expect.any(String));
    expect(res.body.cvVariantText.length).toBeGreaterThan(0);
    expect(res.body.coverLetterText).toEqual(expect.any(String));
    expect(res.body.coverLetterText.length).toBeGreaterThan(0);

    const application = await prisma.client.application.findUniqueOrThrow({
      where: { id: applicationId },
    });
    expect(application.status).toBe('draft_ready');
  });

  it('walks the rest of the approval-first pipeline to applied', async () => {
    await request(app.getHttpServer())
      .patch(`/applications/${applicationId}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'awaiting_approval' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/applications/${applicationId}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'applied' })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get('/applications')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const mine = res.body.find((a: { id: string }) => a.id === applicationId);
    expect(mine.status).toBe('applied');
    expect(mine.jobId).toBe(jobId);
  });

  it('reads a single application by id', async () => {
    const res = await request(app.getHttpServer())
      .get(`/applications/${applicationId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body).toMatchObject({ id: applicationId, jobId, status: 'applied' });
  });

  it('reads the latest draft for an application', async () => {
    const res = await request(app.getHttpServer())
      .get(`/applications/${applicationId}/draft`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.cvVariantText.length).toBeGreaterThan(0);
    expect(res.body.coverLetterText.length).toBeGreaterThan(0);
  });

  it('404s reading a draft for an application with none generated yet', async () => {
    const otherFixture = await createJobFixture(prisma, { jobTitle: 'No Draft Yet Role' });

    const created = await request(app.getHttpServer())
      .post('/applications')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ jobId: otherFixture.canonicalJob.id })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/applications/${created.body.id}/draft`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    await deleteJobFixture(prisma, otherFixture.source.id);
  });

  it('404s reading another user\'s application by id', async () => {
    const email = uniqueEmail('applications-other-reader');
    const authRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'correct-horse-battery-staple' });
    const otherToken = authRes.body.accessToken;
    const otherUserId = authRes.body.user.id;

    await request(app.getHttpServer())
      .get(`/applications/${applicationId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);

    await prisma.client.user.delete({ where: { id: otherUserId } }).catch(() => undefined);
  });

  it('recorded one application_event per status change plus the creation event', async () => {
    const events = await prisma.client.applicationEvent.findMany({
      where: { applicationId },
      orderBy: { createdAt: 'asc' },
    });
    expect(events.map((e) => e.toStatus)).toEqual([
      'new',
      'viewed',
      'draft_ready',
      'awaiting_approval',
      'applied',
    ]);
  });

  it('404s when acting on another user\'s / a nonexistent application', async () => {
    await request(app.getHttpServer())
      .patch('/applications/00000000-0000-0000-0000-000000000000/status')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'viewed' })
      .expect(404);
  });

  it('rejects drafting for a user with no candidate profile yet', async () => {
    const email = uniqueEmail('no-profile');
    const authRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'correct-horse-battery-staple' });
    const token = authRes.body.accessToken;
    const otherUserId = authRes.body.user.id;

    const createRes = await request(app.getHttpServer())
      .post('/applications')
      .set('Authorization', `Bearer ${token}`)
      .send({ jobId })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/applications/${createRes.body.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'viewed' })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/applications/${createRes.body.id}/draft`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(400);

    await prisma.client.user.delete({ where: { id: otherUserId } }).catch(() => undefined);
  });

  describe('multi-variant CV drafting', () => {
    let variantSourceId: string;
    let variantJobId: string;
    let variantApplicationId: string;

    afterAll(async () => {
      await deleteJobFixture(prisma, variantSourceId);
    });

    beforeAll(async () => {
      const fixture = await createJobFixture(prisma, { jobTitle: 'Staff Engineer' });
      variantSourceId = fixture.source.id;
      variantJobId = fixture.canonicalJob.id;

      const created = await request(app.getHttpServer())
        .post('/applications')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ jobId: variantJobId })
        .expect(201);
      variantApplicationId = created.body.id;

      await request(app.getHttpServer())
        .patch(`/applications/${variantApplicationId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'viewed' })
        .expect(200);
    });

    it('generates a standard-style draft for a free-tier user', async () => {
      const res = await request(app.getHttpServer())
        .post(`/applications/${variantApplicationId}/draft`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(201);
      expect(res.body.variantLabel).toBe('standard');
    });

    it('allows regenerating a draft while already draft_ready, instead of 409ing', async () => {
      await request(app.getHttpServer())
        .post(`/applications/${variantApplicationId}/draft`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(201);

      const application = await prisma.client.application.findUniqueOrThrow({
        where: { id: variantApplicationId },
      });
      expect(application.status).toBe('draft_ready');
    });

    it('rejects a non-standard variant style for a free-tier user', async () => {
      const res = await request(app.getHttpServer())
        .post(`/applications/${variantApplicationId}/draft`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ variantStyle: 'concise' })
        .expect(403);
      expect(res.body.message).toContain('Pro subscription');
    });

    it('rejects an unknown variant style value outright', async () => {
      await request(app.getHttpServer())
        .post(`/applications/${variantApplicationId}/draft`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ variantStyle: 'extremely-fancy' })
        .expect(400);
    });

    it('lists every generated draft for the application, most recent first', async () => {
      const res = await request(app.getHttpServer())
        .get(`/applications/${variantApplicationId}/drafts`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(res.body.length).toBe(2);
      expect(res.body.every((d: { variantLabel: string }) => d.variantLabel === 'standard')).toBe(true);
      const createdAts = res.body.map((d: { createdAt: string }) => new Date(d.createdAt).getTime());
      expect(createdAts[0]).toBeGreaterThanOrEqual(createdAts[1]);
    });

    it('allows a Pro-tier user to generate a concise-style variant', async () => {
      await request(app.getHttpServer())
        .post('/billing/webhook')
        .set('stripe-signature', 'test-signature')
        .send({
          type: 'checkout_completed',
          userId,
          stripeCustomerId: 'cus_variant_test',
          stripeSubscriptionId: 'sub_variant_test',
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post(`/applications/${variantApplicationId}/draft`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ variantStyle: 'concise' })
        .expect(201);
      expect(res.body.variantLabel).toBe('concise');

      const listRes = await request(app.getHttpServer())
        .get(`/applications/${variantApplicationId}/drafts`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(listRes.body.length).toBe(3);
      expect(listRes.body[0].variantLabel).toBe('concise');
    });
  });
});
