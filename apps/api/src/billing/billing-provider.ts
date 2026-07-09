export interface CheckoutSessionParams {
  userId: string;
  email: string;
  stripeCustomerId: string | null;
  successUrl: string;
  cancelUrl: string;
}

export interface BillingPortalParams {
  stripeCustomerId: string;
  returnUrl: string;
}

export type BillingWebhookEvent =
  | {
      type: 'checkout_completed';
      userId: string;
      stripeCustomerId: string;
      stripeSubscriptionId: string;
    }
  | {
      type: 'subscription_updated';
      stripeCustomerId: string;
      status: 'active' | 'past_due' | 'canceled';
    }
  | { type: 'subscription_deleted'; stripeCustomerId: string }
  | { type: 'ignored' };

export class BillingWebhookSignatureError extends Error {
  constructor(message = 'Invalid webhook signature') {
    super(message);
    this.name = 'BillingWebhookSignatureError';
  }
}

/**
 * The seam between the API and any payment backend. Mirrors
 * @german-smart-apply/ai's AiProvider pattern: one interface, a deterministic
 * mock used whenever STRIPE_SECRET_KEY is absent (this sandbox has none),
 * and a real Stripe-backed implementation behind the same contract.
 */
export interface BillingProvider {
  createCheckoutSession(params: CheckoutSessionParams): Promise<{ url: string }>;
  createBillingPortalSession(params: BillingPortalParams): Promise<{ url: string }>;
  /** Verifies the webhook signature and maps the event to our narrow union. Throws BillingWebhookSignatureError on an invalid signature. */
  constructWebhookEvent(payload: Buffer, signatureHeader: string | undefined): BillingWebhookEvent;
}
