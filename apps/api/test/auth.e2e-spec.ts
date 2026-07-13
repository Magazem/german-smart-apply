import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, type TestApp } from './test-app.js';
import { uniqueEmail } from './fixtures.js';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: TestApp['prisma'];
  const email = uniqueEmail('auth');
  const password = 'Correct-Horse9-Battery';
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.prisma;
  });

  afterAll(async () => {
    if (createdUserIds.length) {
      await prisma.client.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await app.close();
  });

  it('registers a new account', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password, acceptedTerms: true, acceptedPolicyVersion: '1.0' })
      .expect(201);

    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ email });
    createdUserIds.push(res.body.user.id);
  });

  it('rejects registering the same email twice', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password, acceptedTerms: true, acceptedPolicyVersion: '1.0' })
      .expect(409);
  });

  it('rejects registration with a too-short password', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: uniqueEmail('short'), password: 'short', acceptedTerms: true, acceptedPolicyVersion: '1.0' })
      .expect(400);
  });

  it('rejects registration with a password missing required character classes', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: uniqueEmail('weak'),
        password: 'alllowercase',
        acceptedTerms: true,
        acceptedPolicyVersion: '1.0',
      })
      .expect(400);
  });

  it('rejects registration without accepting the terms', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: uniqueEmail('noconsent'), password, acceptedTerms: false, acceptedPolicyVersion: '1.0' })
      .expect(400);
  });

  it('logs in with correct credentials', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);

    expect(res.body.accessToken).toEqual(expect.any(String));
  });

  it('rejects login with wrong password', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(401);
  });

  it('rejects login for a nonexistent account', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: uniqueEmail('ghost'), password })
      .expect(401);
  });

  it('rejects /auth/me without a token', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('rejects /auth/me with a malformed token', async () => {
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401);
  });

  it('returns the current user with a valid token', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);

    expect(res.body).toMatchObject({ email });
  });
});
