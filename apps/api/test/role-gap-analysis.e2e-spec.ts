import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, type TestApp } from './test-app.js';
import { createJobFixture, deleteJobFixture, uniqueEmail } from './fixtures.js';

describe('Role gap analysis (e2e)', () => {
  let app: INestApplication;
  let prisma: TestApp['prisma'];
  let accessToken: string;
  let userId: string;
  let sourceId: string;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.prisma;

    const email = uniqueEmail('role-gap-analysis');
    const authRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'Correct-Horse9-Battery', acceptedTerms: true, acceptedPolicyVersion: '1.0' });
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

    const fixture = await createJobFixture(prisma, {
      jobTitle: 'Senior Backend Engineer',
      techStackTags: ['typescript', 'node', 'kafka', 'kubernetes'],
    });
    sourceId = fixture.source.id;
  });

  afterAll(async () => {
    await deleteJobFixture(prisma, sourceId);
    await prisma.client.user.delete({ where: { id: userId } }).catch(() => undefined);
    await app.close();
  });

  it('requires auth on every role-gap-analysis route', async () => {
    await request(app.getHttpServer()).get('/role-gap-analysis').expect(401);
    await request(app.getHttpServer())
      .post('/role-gap-analysis')
      .send({ targetRole: 'Backend Engineer' })
      .expect(401);
  });

  it('rejects a target role that is too short', async () => {
    await request(app.getHttpServer())
      .post('/role-gap-analysis')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ targetRole: 'x' })
      .expect(400);
  });

  it('rejects running an analysis for a user with no candidate profile yet', async () => {
    const email = uniqueEmail('role-gap-no-profile');
    const authRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'Correct-Horse9-Battery', acceptedTerms: true, acceptedPolicyVersion: '1.0' });
    const token = authRes.body.accessToken;
    const otherUserId = authRes.body.user.id;

    const res = await request(app.getHttpServer())
      .post('/role-gap-analysis')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetRole: 'Backend Engineer' })
      .expect(400);
    expect(res.body.message).toContain('candidate profile');

    await prisma.client.user.delete({ where: { id: otherUserId } }).catch(() => undefined);
  });

  it('runs a gap analysis and persists it', async () => {
    const res = await request(app.getHttpServer())
      .post('/role-gap-analysis')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ targetRole: 'Backend Engineer' })
      .expect(201);

    expect(res.body.targetRole).toBe('Backend Engineer');
    expect(Array.isArray(res.body.matchingSkills)).toBe(true);
    expect(Array.isArray(res.body.missingSkills)).toBe(true);
    expect(res.body.estimatedReadinessScore).toBeGreaterThanOrEqual(0);
    expect(res.body.estimatedReadinessScore).toBeLessThanOrEqual(100);
    expect(res.body.summary.length).toBeGreaterThan(0);
    expect(res.body.sampleJobCount).toBeGreaterThan(0);

    // MockAiProvider is deterministic: matches profile skills (typescript,
    // node) against tag frequency built from the fixture's techStackTags.
    expect(res.body.matchingSkills.some((s: string) => s.toLowerCase() === 'typescript')).toBe(true);
    expect(res.body.missingSkills.some((s: string) => s.toLowerCase() === 'kafka')).toBe(true);

    const stored = await prisma.client.roleGapAnalysis.findFirst({ where: { userId } });
    expect(stored).not.toBeNull();
    expect(stored?.targetRole).toBe('Backend Engineer');
  });

  it('lists past analyses for the current user, most recent first', async () => {
    await request(app.getHttpServer())
      .post('/role-gap-analysis')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ targetRole: 'Backend Engineer' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/role-gap-analysis')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.length).toBe(2);
    const createdAts = res.body.map((a: { createdAt: string }) => new Date(a.createdAt).getTime());
    expect(createdAts[0]).toBeGreaterThanOrEqual(createdAts[1]);
  });

  it("does not leak another user's analyses", async () => {
    const email = uniqueEmail('role-gap-other-reader');
    const authRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'Correct-Horse9-Battery', acceptedTerms: true, acceptedPolicyVersion: '1.0' });
    const otherToken = authRes.body.accessToken;
    const otherUserId = authRes.body.user.id;

    const res = await request(app.getHttpServer())
      .get('/role-gap-analysis')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200);
    expect(res.body).toEqual([]);

    await prisma.client.user.delete({ where: { id: otherUserId } }).catch(() => undefined);
  });
});
