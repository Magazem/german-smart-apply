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

  it('reads back the most recently parsed CV', async () => {
    const res = await request(app.getHttpServer())
      .get('/cv/last')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.email).toBe('jane.doe@example.com');
  });

  it('backfills fullName/summary from a CV parse when the existing profile has them as empty strings, not just null', async () => {
    const email = uniqueEmail('cv-empty-fields');
    const authRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'correct-horse-battery-staple' });
    const token = authRes.body.accessToken;
    const otherUserId = authRes.body.user.id;

    await request(app.getHttpServer())
      .put('/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: '', summary: '', targetRole: 'Backend Engineer' })
      .expect(200);

    const uploadRes = await request(app.getHttpServer())
      .post('/cv/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from(CV_TEXT, 'utf-8'), {
        filename: 'jane-doe-cv.txt',
        contentType: 'text/plain',
      })
      .expect(201);

    expect(uploadRes.body.profile.fullName).toBe('Jane Doe');
    expect(uploadRes.body.profile.summary).toBeTruthy();

    await prisma.client.user.delete({ where: { id: otherUserId } }).catch(() => undefined);
  });

  it('404s reading the last parsed CV for a user who never uploaded one', async () => {
    const email = uniqueEmail('cv-none');
    const authRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'correct-horse-battery-staple' });
    const token = authRes.body.accessToken;
    const otherUserId = authRes.body.user.id;

    await request(app.getHttpServer())
      .get('/cv/last')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    await prisma.client.user.delete({ where: { id: otherUserId } }).catch(() => undefined);
  });
});
