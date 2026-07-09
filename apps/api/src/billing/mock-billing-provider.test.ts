import { describe, expect, it } from 'vitest';
import { MockBillingProvider } from './mock-billing-provider.js';
import { BillingWebhookSignatureError } from './billing-provider.js';

describe('MockBillingProvider', () => {
  const provider = new MockBillingProvider();

  it('returns a checkout URL scoped to the user', async () => {
    const { url } = await provider.createCheckoutSession({
      userId: 'user-1',
      email: 'jane@example.com',
      stripeCustomerId: null,
      successUrl: 'https://app.example.com/success',
      cancelUrl: 'https://app.example.com/cancel',
    });
    expect(url).toContain('user=user-1');
  });

  it('returns a portal URL scoped to the customer', async () => {
    const { url } = await provider.createBillingPortalSession({
      stripeCustomerId: 'cus_123',
      returnUrl: 'https://app.example.com/billing',
    });
    expect(url).toContain('cus_123');
  });

  it('parses a valid webhook JSON payload', () => {
    const payload = Buffer.from(
      JSON.stringify({
        type: 'checkout_completed',
        userId: 'user-1',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
      }),
    );
    const event = provider.constructWebhookEvent(payload, 'any-signature');
    expect(event).toEqual({
      type: 'checkout_completed',
      userId: 'user-1',
      stripeCustomerId: 'cus_123',
      stripeSubscriptionId: 'sub_123',
    });
  });

  it('rejects the sentinel "invalid" signature so tests can exercise the rejection path', () => {
    const payload = Buffer.from(JSON.stringify({ type: 'ignored' }));
    expect(() => provider.constructWebhookEvent(payload, 'invalid')).toThrow(
      BillingWebhookSignatureError,
    );
  });

  it('rejects malformed JSON payloads', () => {
    expect(() => provider.constructWebhookEvent(Buffer.from('not json'), 'sig')).toThrow(
      BillingWebhookSignatureError,
    );
  });
});
