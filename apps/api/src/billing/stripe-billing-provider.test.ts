import { describe, expect, it, vi } from 'vitest';
import Stripe from 'stripe';
import { StripeBillingProvider } from './stripe-billing-provider.js';
import { BillingWebhookSignatureError } from './billing-provider.js';

const WEBHOOK_SECRET = 'whsec_test_secret';

function buildProvider(fakeClient: Partial<Stripe>) {
  return new StripeBillingProvider(
    { secretKey: 'sk_test_x', webhookSecret: WEBHOOK_SECRET, proPriceId: 'price_pro' },
    fakeClient as Stripe,
  );
}

describe('StripeBillingProvider - checkout/portal (fake client, no network)', () => {
  it('creates a checkout session with the price/customer/metadata wired through', async () => {
    const create = vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/session_123' });
    const provider = buildProvider({ checkout: { sessions: { create } } as never });

    const { url } = await provider.createCheckoutSession({
      userId: 'user-1',
      email: 'jane@example.com',
      stripeCustomerId: null,
      successUrl: 'https://app.example.com/success',
      cancelUrl: 'https://app.example.com/cancel',
    });

    expect(url).toBe('https://checkout.stripe.com/session_123');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        line_items: [{ price: 'price_pro', quantity: 1 }],
        client_reference_id: 'user-1',
        customer_email: 'jane@example.com',
      }),
    );
  });

  it('throws if Stripe returns no session URL', async () => {
    const create = vi.fn().mockResolvedValue({ url: null });
    const provider = buildProvider({ checkout: { sessions: { create } } as never });
    await expect(
      provider.createCheckoutSession({
        userId: 'user-1',
        email: 'jane@example.com',
        stripeCustomerId: null,
        successUrl: 'https://a',
        cancelUrl: 'https://b',
      }),
    ).rejects.toThrow('Stripe did not return a checkout session URL');
  });

  it('creates a billing portal session for an existing customer', async () => {
    const create = vi.fn().mockResolvedValue({ url: 'https://billing.stripe.com/portal_123' });
    const provider = buildProvider({ billingPortal: { sessions: { create } } as never });
    const { url } = await provider.createBillingPortalSession({
      stripeCustomerId: 'cus_123',
      returnUrl: 'https://app.example.com/billing',
    });
    expect(url).toBe('https://billing.stripe.com/portal_123');
    expect(create).toHaveBeenCalledWith({
      customer: 'cus_123',
      return_url: 'https://app.example.com/billing',
    });
  });
});

describe('StripeBillingProvider.constructWebhookEvent (real Stripe SDK signature verification, offline)', () => {
  // Uses the real, unmocked Stripe SDK for signing/verification - only the
  // network-calling parts (checkout/portal creation) are faked above. This
  // exercises genuine signature verification without a live Stripe account.
  const realStripe = new Stripe('sk_test_unused');
  const provider = new StripeBillingProvider(
    { secretKey: 'sk_test_unused', webhookSecret: WEBHOOK_SECRET, proPriceId: 'price_pro' },
    realStripe,
  );

  function sign(event: unknown) {
    const payload = JSON.stringify(event);
    const header = realStripe.webhooks.generateTestHeaderString({
      payload,
      secret: WEBHOOK_SECRET,
    });
    return { payload: Buffer.from(payload), header };
  }

  it('maps checkout.session.completed to checkout_completed', () => {
    const { payload, header } = sign({
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: 'user-1',
          customer: 'cus_123',
          subscription: 'sub_123',
          metadata: {},
        },
      },
    });
    const result = provider.constructWebhookEvent(payload, header);
    expect(result).toEqual({
      type: 'checkout_completed',
      userId: 'user-1',
      stripeCustomerId: 'cus_123',
      stripeSubscriptionId: 'sub_123',
    });
  });

  it('maps customer.subscription.updated (active) to subscription_updated/active', () => {
    const { payload, header } = sign({
      id: 'evt_2',
      type: 'customer.subscription.updated',
      data: { object: { customer: 'cus_123', status: 'active' } },
    });
    const result = provider.constructWebhookEvent(payload, header);
    expect(result).toEqual({
      type: 'subscription_updated',
      stripeCustomerId: 'cus_123',
      status: 'active',
    });
  });

  it('maps customer.subscription.updated (past_due) to subscription_updated/past_due', () => {
    const { payload, header } = sign({
      id: 'evt_3',
      type: 'customer.subscription.updated',
      data: { object: { customer: 'cus_123', status: 'past_due' } },
    });
    const result = provider.constructWebhookEvent(payload, header);
    expect(result).toMatchObject({ type: 'subscription_updated', status: 'past_due' });
  });

  it('maps customer.subscription.deleted to subscription_deleted', () => {
    const { payload, header } = sign({
      id: 'evt_4',
      type: 'customer.subscription.deleted',
      data: { object: { customer: 'cus_123' } },
    });
    const result = provider.constructWebhookEvent(payload, header);
    expect(result).toEqual({ type: 'subscription_deleted', stripeCustomerId: 'cus_123' });
  });

  it('maps an unhandled event type to ignored', () => {
    const { payload, header } = sign({ id: 'evt_5', type: 'invoice.paid', data: { object: {} } });
    const result = provider.constructWebhookEvent(payload, header);
    expect(result).toEqual({ type: 'ignored' });
  });

  it('rejects a payload signed with the wrong secret', () => {
    const payload = JSON.stringify({ id: 'evt_6', type: 'checkout.session.completed' });
    const badHeader = realStripe.webhooks.generateTestHeaderString({
      payload,
      secret: 'whsec_wrong_secret',
    });
    expect(() =>
      provider.constructWebhookEvent(Buffer.from(payload), badHeader),
    ).toThrow(BillingWebhookSignatureError);
  });

  it('rejects a tampered payload (signature no longer matches body)', () => {
    const original = JSON.stringify({ id: 'evt_7', type: 'checkout.session.completed' });
    const header = realStripe.webhooks.generateTestHeaderString({
      payload: original,
      secret: WEBHOOK_SECRET,
    });
    const tampered = Buffer.from(
      JSON.stringify({ id: 'evt_7', type: 'checkout.session.completed', tampered: true }),
    );
    expect(() => provider.constructWebhookEvent(tampered, header)).toThrow(
      BillingWebhookSignatureError,
    );
  });

  it('rejects a missing signature header', () => {
    expect(() =>
      provider.constructWebhookEvent(Buffer.from('{}'), undefined),
    ).toThrow(BillingWebhookSignatureError);
  });
});
