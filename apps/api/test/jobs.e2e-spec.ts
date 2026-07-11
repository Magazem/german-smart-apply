import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, type TestApp } from './test-app.js';
import { createJobFixture, deleteJobFixture, uniqueEmail } from './fixtures.js';

describe('Jobs search & detail (e2e)', () => {
  let app: INestApplication;
  let prisma: TestApp['prisma'];
  let accessToken: string;
  let userId: string;

  let matchingSourceId: string;
  let matchingJobId: string;
  let offTopicSourceId: string;
  let hiddenSourceId: string;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.prisma;

    const email = uniqueEmail('jobs');
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
        skills: ['typescript', 'node', 'postgres'],
      })
      .expect(200);

    const matching = await createJobFixture(prisma, {
      jobTitle: 'Senior Backend Engineer',
      techStackTags: ['typescript', 'node', 'postgres'],
      countryCode: 'DE',
      remoteType: 'hybrid',
      seniority: 'senior',
    });
    matchingSourceId = matching.source.id;
    matchingJobId = matching.canonicalJob.id;

    const offTopic = await createJobFixture(prisma, {
      jobTitle: 'Junior Marketing Intern',
      techStackTags: ['excel', 'canva'],
      countryCode: 'FR',
      remoteType: 'onsite',
      seniority: 'intern',
    });
    offTopicSourceId = offTopic.source.id;

    const hidden = await createJobFixture(prisma, { jobTitle: 'Hidden Role' });
    hiddenSourceId = hidden.source.id;
    await prisma.client.canonicalJob.update({
      where: { id: hidden.canonicalJob.id },
      data: { isVisible: false },
    });
  });

  afterAll(async () => {
    await deleteJobFixture(prisma, matchingSourceId);
    await deleteJobFixture(prisma, offTopicSourceId);
    await deleteJobFixture(prisma, hiddenSourceId);
    await prisma.client.user.delete({ where: { id: userId } }).catch(() => undefined);
    await app.close();
  });

  it('is browsable without auth', async () => {
    const res = await request(app.getHttpServer()).get('/jobs/search').expect(200);
    expect(res.body.results.length).toBeGreaterThan(0);
  });

  it('never returns jobs with isVisible=false', async () => {
    const res = await request(app.getHttpServer()).get('/jobs/search?limit=100').expect(200);
    const titles = res.body.results.map(
      (r: { job: { jobTitleNormalized: string } }) => r.job.jobTitleNormalized,
    );
    expect(titles).not.toContain('hidden role');
  });

  it('filters by country code', async () => {
    const res = await request(app.getHttpServer())
      .get('/jobs/search')
      .query({ locationCountryCode: 'FR' })
      .expect(200);
    for (const r of res.body.results) {
      expect(r.job.countryCode).toBe('FR');
    }
    expect(res.body.results.some((r: { job: { jobId: string } }) => r.job.jobId === matchingJobId)).toBe(
      false,
    );
  });

  it('filters by tech stack', async () => {
    const res = await request(app.getHttpServer())
      .get('/jobs/search')
      .query({ stack: 'typescript' })
      .expect(200);
    expect(
      res.body.results.some((r: { job: { jobId: string } }) => r.job.jobId === matchingJobId),
    ).toBe(true);
  });

  it('ranks a profile-matching job above an unrelated one when authenticated', async () => {
    const res = await request(app.getHttpServer())
      .get('/jobs/search')
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ limit: 100 })
      .expect(200);

    type Result = { job: { jobId: string; jobTitleNormalized: string }; score: { totalScore: number } };
    const results = res.body.results as Result[];
    const matching = results.find((r) => r.job.jobId === matchingJobId);
    const offTopic = results.find((r) => r.job.jobTitleNormalized === 'junior marketing intern');

    expect(matching).toBeDefined();
    expect(offTopic).toBeDefined();
    expect(matching!.score.totalScore).toBeGreaterThan(offTopic!.score.totalScore);

    const matchingIndex = results.findIndex((r) => r.job.jobId === matchingJobId);
    const offTopicIndex = results.findIndex((r) => r.job.jobTitleNormalized === 'junior marketing intern');
    expect(matchingIndex).toBeLessThan(offTopicIndex);
  });

  it('returns job detail with a match explanation for an authenticated profile-holder', async () => {
    const res = await request(app.getHttpServer())
      .get(`/jobs/${matchingJobId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.job.jobId).toBe(matchingJobId);
    expect(res.body.score.explanation).toEqual(expect.any(String));
    expect(res.body.score.explanation.length).toBeGreaterThan(0);
  });

  it('returns job detail without an explanation for an anonymous request', async () => {
    const res = await request(app.getHttpServer()).get(`/jobs/${matchingJobId}`).expect(200);
    expect(res.body.job.jobId).toBe(matchingJobId);
    expect(res.body.score.explanation).toBeUndefined();
  });

  it('404s for an unknown job id', async () => {
    await request(app.getHttpServer())
      .get('/jobs/00000000-0000-0000-0000-000000000000')
      .expect(404);
  });

  describe('feedback (like/skip)', () => {
    it('rejects an unauthenticated feedback attempt', async () => {
      await request(app.getHttpServer())
        .post(`/jobs/${matchingJobId}/feedback`)
        .send({ feedback: 'like' })
        .expect(401);
    });

    it('rejects a feedback value outside like/skip', async () => {
      await request(app.getHttpServer())
        .post(`/jobs/${matchingJobId}/feedback`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ feedback: 'love-it' })
        .expect(400);
    });

    it('records a like, reflects it on job detail, and toggling the same value again clears it', async () => {
      const likeRes = await request(app.getHttpServer())
        .post(`/jobs/${matchingJobId}/feedback`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ feedback: 'like' })
        .expect(201);
      expect(likeRes.body.feedback).toBe('like');

      const detailRes = await request(app.getHttpServer())
        .get(`/jobs/${matchingJobId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(detailRes.body.myFeedback).toBe('like');

      const undoRes = await request(app.getHttpServer())
        .post(`/jobs/${matchingJobId}/feedback`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ feedback: 'like' })
        .expect(201);
      expect(undoRes.body.feedback).toBeNull();

      const clearedDetailRes = await request(app.getHttpServer())
        .get(`/jobs/${matchingJobId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(clearedDetailRes.body.myFeedback).toBeNull();
    });

    it('switching from like to skip replaces the prior feedback rather than stacking it', async () => {
      await request(app.getHttpServer())
        .post(`/jobs/${matchingJobId}/feedback`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ feedback: 'like' })
        .expect(201);

      const skipRes = await request(app.getHttpServer())
        .post(`/jobs/${matchingJobId}/feedback`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ feedback: 'skip' })
        .expect(201);
      expect(skipRes.body.feedback).toBe('skip');

      const detailRes = await request(app.getHttpServer())
        .get(`/jobs/${matchingJobId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(detailRes.body.myFeedback).toBe('skip');

      // Clean up so this doesn't leak bias into other tests in this file.
      await request(app.getHttpServer())
        .post(`/jobs/${matchingJobId}/feedback`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ feedback: 'skip' })
        .expect(201);
    });

    it('404s when recording feedback for an unknown job id', async () => {
      await request(app.getHttpServer())
        .post('/jobs/00000000-0000-0000-0000-000000000000/feedback')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ feedback: 'like' })
        .expect(404);
    });
  });
});
