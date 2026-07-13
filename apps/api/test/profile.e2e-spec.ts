import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, type TestApp } from './test-app.js';
import { uniqueEmail } from './fixtures.js';

describe('Profile (e2e)', () => {
  let app: INestApplication;
  let prisma: TestApp['prisma'];
  let accessToken: string;
  let userId: string;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.prisma;

    const email = uniqueEmail('profile');
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'Correct-Horse9-Battery', acceptedTerms: true, acceptedPolicyVersion: '1.0' });
    accessToken = res.body.accessToken;
    userId = res.body.user.id;
  });

  afterAll(async () => {
    await prisma.client.user.delete({ where: { id: userId } }).catch(() => undefined);
    await app.close();
  });

  it('requires auth', async () => {
    await request(app.getHttpServer()).get('/profile').expect(401);
  });

  it('has no profile yet', async () => {
    await request(app.getHttpServer())
      .get('/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  it('rejects an invalid enum value even on a partial payload', async () => {
    await request(app.getHttpServer())
      .put('/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ seniority: 'not-a-real-level' })
      .expect(400);
  });

  it('accepts a partial CV-parse-style payload before onboarding questions are answered, with placeholder defaults for the still-missing required-shaped fields', async () => {
    const email = uniqueEmail('profile-partial');
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'Correct-Horse9-Battery', acceptedTerms: true, acceptedPolicyVersion: '1.0' });
    const partialToken = res.body.accessToken as string;
    const partialUserId = res.body.user.id as string;

    const profileRes = await request(app.getHttpServer())
      .put('/profile')
      .set('Authorization', `Bearer ${partialToken}`)
      .send({ fullName: 'Jane Doe', skills: ['typescript'], summary: 'Backend-leaning generalist.' })
      .expect(200);

    expect(profileRes.body.fullName).toBe('Jane Doe');
    expect(profileRes.body.targetRole).toBe('Not specified yet');
    expect(profileRes.body.seniority).toBe('mid');

    await prisma.client.user.delete({ where: { id: partialUserId } }).catch(() => undefined);
  });

  it('creates the profile with the free-tier onboarding fields', async () => {
    const res = await request(app.getHttpServer())
      .put('/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        targetRole: 'Backend Engineer',
        targetCountryCode: 'DE',
        preferredLanguage: 'en',
        seniority: 'mid',
        locationPreference: 'hybrid',
      })
      .expect(200);

    expect(res.body).toMatchObject({
      targetRole: 'Backend Engineer',
      targetCountryCode: 'DE',
      preferredLanguage: 'en',
      seniority: 'mid',
      locationPreference: 'hybrid',
    });
  });

  it('reads the created profile back', async () => {
    const res = await request(app.getHttpServer())
      .get('/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.targetRole).toBe('Backend Engineer');
  });

  it('updates paid-tier fields on top of the required ones', async () => {
    const res = await request(app.getHttpServer())
      .put('/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        targetRole: 'Backend Engineer',
        targetCountryCode: 'DE',
        preferredLanguage: 'en',
        seniority: 'mid',
        locationPreference: 'hybrid',
        skills: ['typescript', 'postgres'],
        salaryTargetMin: 55000,
        salaryTargetMax: 75000,
      })
      .expect(200);

    expect(res.body.skills).toEqual(['typescript', 'postgres']);
    expect(res.body.salaryTargetMin).toBe(55000);
  });
});
