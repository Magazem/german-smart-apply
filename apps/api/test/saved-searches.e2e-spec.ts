import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, type TestApp } from './test-app.js';
import { uniqueEmail } from './fixtures.js';

describe('Saved searches (e2e)', () => {
  let app: INestApplication;
  let prisma: TestApp['prisma'];
  let accessToken: string;
  let userId: string;
  let savedSearchId: string;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.prisma;

    const email = uniqueEmail('saved-search');
    const authRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'correct-horse-battery-staple' });
    accessToken = authRes.body.accessToken;
    userId = authRes.body.user.id;
  });

  afterAll(async () => {
    await prisma.client.user.delete({ where: { id: userId } }).catch(() => undefined);
    await app.close();
  });

  it('requires auth', async () => {
    await request(app.getHttpServer()).get('/saved-searches').expect(401);
  });

  it('starts with an empty list', async () => {
    const res = await request(app.getHttpServer())
      .get('/saved-searches')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body).toEqual([]);
  });

  it('creates a saved search', async () => {
    const res = await request(app.getHttpServer())
      .post('/saved-searches')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Berlin backend roles',
        filters: { title: 'Backend Engineer', locationCountryCode: 'DE', remoteType: ['hybrid'] },
      })
      .expect(201);

    expect(res.body.name).toBe('Berlin backend roles');
    expect(res.body.isActive).toBe(true);
    savedSearchId = res.body.id;
  });

  it('reads it back individually', async () => {
    const res = await request(app.getHttpServer())
      .get(`/saved-searches/${savedSearchId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.filters).toMatchObject({ title: 'Backend Engineer' });
  });

  it('updates it', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/saved-searches/${savedSearchId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ isActive: false })
      .expect(200);
    expect(res.body.isActive).toBe(false);
  });

  it('404s for another user (or nonexistent) saved search', async () => {
    await request(app.getHttpServer())
      .get('/saved-searches/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  it('deletes it', async () => {
    await request(app.getHttpServer())
      .delete(`/saved-searches/${savedSearchId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/saved-searches/${savedSearchId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });
});
