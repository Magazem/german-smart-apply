import { afterEach, describe, expect, it } from 'vitest';
import { createBillingProvider } from './billing.service.js';
import { MockBillingProvider } from './mock-billing-provider.js';
import { StripeBillingProvider } from './stripe-billing-provider.js';

const STRIPE_ENV_KEYS = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRO_PRICE_ID'] as const;

function clearStripeEnv() {
  for (const key of STRIPE_ENV_KEYS) delete process.env[key];
  delete process.env.NODE_ENV;
}

describe('createBillingProvider', () => {
  afterEach(clearStripeEnv);

  it('returns MockBillingProvider outside production when Stripe env vars are unset', () => {
    clearStripeEnv();
    expect(createBillingProvider()).toBeInstanceOf(MockBillingProvider);
  });

  it('returns StripeBillingProvider when all three Stripe env vars are set', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_x';
    process.env.STRIPE_PRO_PRICE_ID = 'price_x';
    expect(createBillingProvider()).toBeInstanceOf(StripeBillingProvider);
  });

  it('refuses to start with MockBillingProvider in production (fails closed)', () => {
    clearStripeEnv();
    process.env.NODE_ENV = 'production';
    expect(() => createBillingProvider()).toThrow(/must all be set in production/);
  });

  it('still uses StripeBillingProvider in production when all three vars are set', () => {
    process.env.NODE_ENV = 'production';
    process.env.STRIPE_SECRET_KEY = 'sk_live_x';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_live_x';
    process.env.STRIPE_PRO_PRICE_ID = 'price_live_x';
    expect(createBillingProvider()).toBeInstanceOf(StripeBillingProvider);
  });
});
