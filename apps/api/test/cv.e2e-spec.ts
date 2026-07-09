import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, type TestApp } from './test-app.js';
import { uniqueEmail } from './fixtures.js';

const CV_TEXT = [
  'Jane Doe',
  'jane.doe@example.com',
  'Skills: TypeScript, NestJS, PostgreSQL, Docker',
  'Experienced backend engineer.',
].join('\n');

describe('CV upload (e2e)', () => {
  let app: INestApplication;
  let prisma: TestApp['prisma'];
  let accessToken: string;
  let userId: string;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.prisma;

    const email = uniqueEmail('cv');
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

  it('requires auth', async () => {
    await request(app.getHttpServer()).post('/cv/upload').expect(401);
  });

  it('rejects a request with no file', async () => {
    await request(app.getHttpServer())
      .post('/cv/upload')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(400);
  });

  it('uploads and parses a CV, prefilling the candidate profile', async () => {
    const res = await request(app.getHttpServer())
      .post('/cv/upload')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', Buffer.from(CV_TEXT, 'utf-8'), {
        filename: 'jane-doe-cv.txt',
        contentType: 'text/plain',
      })
      .expect(201);

    expect(res.body.cvDocument.parseStatus).toBe('parsed');
    expect(res.body.parsed.email).toBe('jane.doe@example.com');
    expect(res.body.parsed.skills).toEqual(
      expect.arrayContaining(['TypeScript', 'NestJS', 'PostgreSQL', 'Docker']),
    );
    expect(res.body.profile.skills).toEqual(
      expect.arrayContaining(['TypeScript', 'NestJS', 'PostgreSQL', 'Docker']),
    );
    expect(res.body.profile.fullName).toBe('Jane Doe');
  });

  it('rejects an unsupported file type', async () => {
    await request(app.getHttpServer())
      .post('/cv/upload')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', Buffer.from('binary-ish content'), {
        filename: 'cv.exe',
        contentType: 'application/octet-stream',
      })
      .expect(400);
  });
});
