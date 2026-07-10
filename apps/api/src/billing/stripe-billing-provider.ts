import Stripe from 'stripe';
import type {
  BillingPortalParams,
  BillingProvider,
  BillingWebhookEvent,
  CheckoutSessionParams,
} from './billing-provider.js';
import { BillingWebhookSignatureError } from './billing-provider.js';

export interface StripeBillingProviderOptions {
  secretKey: string;
  webhookSecret: string;
  proPriceId: string;
}

/**
 * Real Stripe-backed BillingProvider. Constructor-injected Stripe client so
 * tests never hit the network - see stripe-billing-provider.test.ts, which
 * exercises constructWebhookEvent against Stripe's own
 * webhooks.generateTestHeaderString() helper (a real, offline signature),
 * so the signature-verification path is genuinely tested without a live key.
 */
export class StripeBillingProvider implements BillingProvider {
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;
  private readonly proPriceId: string;

  constructor(options: StripeBillingProviderOptions, stripeClient?: Stripe) {
    this.stripe = stripeClient ?? new Stripe(options.secretKey);
    this.webhookSecret = options.webhookSecret;
    this.proPriceId = options.proPriceId;
  }

  async createCheckoutSession(params: CheckoutSessionParams): Promise<{ url: string }> {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: this.proPriceId, quantity: 1 }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      customer: params.stripeCustomerId ?? undefined,
      customer_email: params.stripeCustomerId ? undefined : params.email,
      client_reference_id: params.userId,
      metadata: { userId: params.userId },
      subscription_data: { metadata: { userId: params.userId } },
    });
    if (!session.url) {
      throw new Error('Stripe did not return a checkout session URL');
    }
    return { url: session.url };
  }

  async createBillingPortalSession(params: BillingPortalParams): Promise<{ url: string }> {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: params.stripeCustomerId,
      return_url: params.returnUrl,
    });
    return { url: session.url };
  }

  constructWebhookEvent(payload: Buffer, signatureHeader: string | undefined): BillingWebhookEvent {
    if (!signatureHeader) {
      throw new BillingWebhookSignatureError('Missing stripe-signature header');
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(payload, signatureHeader, this.webhookSecret);
    } catch (err) {
      throw new BillingWebhookSignatureError(
        err instanceof Error ? err.message : 'Webhook signature verification failed',
      );
    }

    return this.mapEvent(event);
  }

  private mapEvent(event: Stripe.Event): BillingWebhookEvent {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id ?? session.metadata?.userId;
        const stripeCustomerId =
          typeof session.customer === 'string' ? session.customer : session.customer?.id;
        const stripeSubscriptionId =
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id;
        if (!userId || !stripeCustomerId || !stripeSubscriptionId) {
          return { type: 'ignored' };
        }
        return {
          type: 'checkout_completed',
          userId,
          stripeCustomerId,
          stripeSubscriptionId,
        };
      }
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const stripeCustomerId =
          typeof subscription.customer === 'string'
            ? subscription.customer
            : subscription.customer.id;
        const status = this.mapSubscriptionStatus(subscription.status);
        if (!status) {
          return { type: 'ignored' };
        }
        return { type: 'subscription_updated', stripeCustomerId, status };
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const stripeCustomerId =
          typeof subscription.customer === 'string'
            ? subscription.customer
            : subscription.customer.id;
        return { type: 'subscription_deleted', stripeCustomerId };
      }
      default:
        return { type: 'ignored' };
    }
  }

  private mapSubscriptionStatus(
    status: Stripe.Subscription.Status,
  ): 'active' | 'past_due' | 'canceled' | null {
    switch (status) {
      case 'active':
      case 'trialing':
        return 'active';
      case 'past_due':
      case 'unpaid':
        return 'past_due';
      case 'canceled':
      case 'incomplete_expired':
        return 'canceled';
      default:
        return null;
    }
  }
}
