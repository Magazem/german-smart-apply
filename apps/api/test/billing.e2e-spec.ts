import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, type TestApp } from './test-app.js';
import { uniqueEmail } from './fixtures.js';

describe('Billing (e2e, MockBillingProvider - no Stripe keys in this sandbox)', () => {
  let app: INestApplication;
  let prisma: TestApp['prisma'];
  let accessToken: string;
  let userId: string;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.prisma;

    const email = uniqueEmail('billing');
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

  it('requires auth for checkout/portal/status', async () => {
    await request(app.getHttpServer()).post('/billing/checkout-session').expect(401);
    await request(app.getHttpServer()).post('/billing/portal-session').expect(401);
    await request(app.getHttpServer()).get('/billing/status').expect(401);
  });

  it('starts on the free tier with no billing account', async () => {
    const res = await request(app.getHttpServer())
      .get('/billing/status')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body).toEqual({ tier: 'free', hasBillingAccount: false });
  });

  it('creates a checkout session scoped to the authenticated user', async () => {
    const res = await request(app.getHttpServer())
      .post('/billing/checkout-session')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    expect(res.body.url).toContain(`user=${userId}`);
  });

  it('refuses a billing portal session before any checkout has happened', async () => {
    await request(app.getHttpServer())
      .post('/billing/portal-session')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(400);
  });

  it('rejects a webhook with the sentinel invalid signature', async () => {
    await request(app.getHttpServer())
      .post('/billing/webhook')
      .set('stripe-signature', 'invalid')
      .send({ type: 'ignored' })
      .expect(400);
  });

  it('upgrades the user to pro on a checkout_completed webhook event', async () => {
    await request(app.getHttpServer())
      .post('/billing/webhook')
      .set('stripe-signature', 'test-signature')
      .send({
        type: 'checkout_completed',
        userId,
        stripeCustomerId: 'cus_test_123',
        stripeSubscriptionId: 'sub_test_123',
      })
      .expect(201)
      .then((res) => expect(res.body).toEqual({ received: true }));

    const status = await request(app.getHttpServer())
      .get('/billing/status')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(status.body).toEqual({ tier: 'pro', hasBillingAccount: true });
  });

  it('now allows a billing portal session since a Stripe customer exists', async () => {
    const res = await request(app.getHttpServer())
      .post('/billing/portal-session')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    expect(res.body.url).toContain('cus_test_123');
  });

  it('downgrades the user on a subscription_deleted webhook event', async () => {
    await request(app.getHttpServer())
      .post('/billing/webhook')
      .set('stripe-signature', 'test-signature')
      .send({ type: 'subscription_deleted', stripeCustomerId: 'cus_test_123' })
      .expect(201);

    const status = await request(app.getHttpServer())
      .get('/billing/status')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(status.body.tier).toBe('canceled');
  });
});
