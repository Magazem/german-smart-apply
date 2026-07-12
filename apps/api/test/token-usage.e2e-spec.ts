import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, type TestApp } from './test-app.js';
import { uniqueEmail } from './fixtures.js';

const CV_TEXT = ['Jane Doe', 'jane.doe@example.com', 'Skills: TypeScript'].join('\n');

describe('Token usage tracking (e2e)', () => {
  let app: INestApplication;
  let prisma: TestApp['prisma'];
  let accessToken: string;
  let userId: string;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.prisma;

    const email = uniqueEmail('usage');
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'correct-horse-battery-staple' });
    accessToken = res.body.accessToken;
    userId = res.body.user.id;
  });

  afterAll(async () => {
    await prisma.client.user.delete({ where: { id: userId } }).catch(() => undefined);
    await app.close();
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer()).get('/usage').expect(401);
  });

  it('returns zero usage for a brand-new user', async () => {
    const res = await request(app.getHttpServer())
      .get('/usage')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.totalTokens).toBe(0);
    expect(res.body.byFeature).toEqual([]);
  });

  it('does not record a token_usage_events row for a MockAiProvider call reporting 0 tokens', async () => {
    // Real end-to-end path (not a direct DB insert): the mock provider used
    // in dev/test always reports tokensUsed: 0, and TokenUsageService.record
    // is expected to skip those - confirms the skip actually happens on the
    // real controller -> service -> AI provider path, not just in isolation.
    await request(app.getHttpServer())
      .post('/cv/upload')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', Buffer.from(CV_TEXT, 'utf-8'), { filename: 'cv.txt', contentType: 'text/plain' })
      .expect(201);

    const count = await prisma.client.tokenUsageEvent.count({ where: { userId, feature: 'parseCv' } });
    expect(count).toBe(0);
  });

  it('aggregates recorded usage per feature, sorted by tokens used descending', async () => {
    await prisma.client.tokenUsageEvent.createMany({
      data: [
        { userId, feature: 'parseCv', modelUsed: 'claude-haiku-4-5', tokensUsed: 500 },
        { userId, feature: 'cvVariant', modelUsed: 'claude-sonnet-5', tokensUsed: 1200 },
        { userId, feature: 'cvVariant', modelUsed: 'claude-sonnet-5', tokensUsed: 800 },
        { userId, feature: 'coverLetter', modelUsed: 'claude-sonnet-5', tokensUsed: 600 },
      ],
    });

    const res = await request(app.getHttpServer())
      .get('/usage')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.totalTokens).toBe(3100);
    expect(res.body.byFeature).toEqual([
      { feature: 'cvVariant', tokensUsed: 2000, callCount: 2 },
      { feature: 'coverLetter', tokensUsed: 600, callCount: 1 },
      { feature: 'parseCv', tokensUsed: 500, callCount: 1 },
    ]);
  });

  it('never mixes usage between different users', async () => {
    const email = uniqueEmail('usage-other');
    const authRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'correct-horse-battery-staple' });
    const otherToken = authRes.body.accessToken;
    const otherUserId = authRes.body.user.id;

    const res = await request(app.getHttpServer())
      .get('/usage')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200);
    expect(res.body.totalTokens).toBe(0);
    expect(res.body.byFeature).toEqual([]);

    await prisma.client.user.delete({ where: { id: otherUserId } }).catch(() => undefined);
  });
});
