import { randomUUID } from 'node:crypto';
import type {
  BillingPortalParams,
  BillingProvider,
  BillingWebhookEvent,
  CheckoutSessionParams,
} from './billing-provider.js';
import { BillingWebhookSignatureError } from './billing-provider.js';

/**
 * No-network stand-in used whenever STRIPE_SECRET_KEY is unset. Checkout
 * "sessions" are fake URLs a test/dev client can inspect; webhook events are
 * parsed directly from the JSON body (no real signature scheme exists to
 * verify against), except that a payload signed with the sentinel value
 * `"invalid"` is rejected, so callers can still exercise the
 * signature-rejection path in tests without a real Stripe secret.
 */
export class MockBillingProvider implements BillingProvider {
  async createCheckoutSession(params: CheckoutSessionParams): Promise<{ url: string }> {
    const sessionId = randomUUID();
    return { url: `https://billing.mock.invalid/checkout/${sessionId}?user=${params.userId}` };
  }

  async createBillingPortalSession(params: BillingPortalParams): Promise<{ url: string }> {
    return {
      url: `https://billing.mock.invalid/portal/${params.stripeCustomerId}`,
    };
  }

  constructWebhookEvent(payload: Buffer, signatureHeader: string | undefined): BillingWebhookEvent {
    if (signatureHeader === 'invalid') {
      throw new BillingWebhookSignatureError();
    }
    try {
      return JSON.parse(payload.toString('utf-8')) as BillingWebhookEvent;
    } catch {
      throw new BillingWebhookSignatureError('Malformed webhook payload');
    }
  }
}
