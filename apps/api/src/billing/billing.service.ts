import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { BillingProvider, BillingWebhookEvent } from './billing-provider.js';
import { MockBillingProvider } from './mock-billing-provider.js';
import { StripeBillingProvider } from './stripe-billing-provider.js';

export function createBillingProvider(): BillingProvider {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const proPriceId = process.env.STRIPE_PRO_PRICE_ID;
  if (secretKey && webhookSecret && proPriceId) {
    return new StripeBillingProvider({ secretKey, webhookSecret, proPriceId });
  }
  // Fail closed in production: MockBillingProvider's webhook handler trusts
  // any request body it can JSON.parse (there is no real Stripe account to
  // verify a signature against), and /billing/webhook is deliberately
  // unauthenticated - letting this combination reach production would let
  // anyone flip any user's subscription tier with an unsigned HTTP request.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and STRIPE_PRO_PRICE_ID must all be set in production - refusing to start with the unsigned MockBillingProvider webhook path.',
    );
  }
  return new MockBillingProvider();
}

@Injectable()
export class BillingService {
  private readonly provider: BillingProvider;

  constructor(private readonly prisma: PrismaService) {
    // TODO: this reads env vars directly (matching AuthService's convention
    // elsewhere in this app) rather than @nestjs/config, so it stays a drop-in
    // swap once real Stripe keys exist - no config wiring to change.
    this.provider = createBillingProvider();
  }

  async createCheckoutSession(userId: string): Promise<{ url: string }> {
    const user = await this.prisma.client.user.findUniqueOrThrow({ where: { id: userId } });
    const baseUrl = process.env.WEB_APP_URL ?? 'http://localhost:3100';
    return this.provider.createCheckoutSession({
      userId: user.id,
      email: user.email,
      stripeCustomerId: user.stripeCustomerId,
      successUrl: `${baseUrl}/billing?checkout=success`,
      cancelUrl: `${baseUrl}/billing?checkout=cancelled`,
    });
  }

  async createBillingPortalSession(userId: string): Promise<{ url: string }> {
    const user = await this.prisma.client.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.stripeCustomerId) {
      throw new BadRequestException('No billing account exists for this user yet');
    }
    const baseUrl = process.env.WEB_APP_URL ?? 'http://localhost:3100';
    return this.provider.createBillingPortalSession({
      stripeCustomerId: user.stripeCustomerId,
      returnUrl: `${baseUrl}/billing`,
    });
  }

  async getStatus(userId: string) {
    const user = await this.prisma.client.user.findUniqueOrThrow({
      where: { id: userId },
      select: { subscriptionStatus: true, stripeCustomerId: true },
    });
    return { tier: user.subscriptionStatus, hasBillingAccount: Boolean(user.stripeCustomerId) };
  }

  handleWebhookPayload(payload: Buffer, signatureHeader: string | undefined): Promise<void> {
    const event = this.provider.constructWebhookEvent(payload, signatureHeader);
    return this.applyWebhookEvent(event);
  }

  private async applyWebhookEvent(event: BillingWebhookEvent): Promise<void> {
    switch (event.type) {
      case 'checkout_completed':
        await this.prisma.client.user.update({
          where: { id: event.userId },
          data: {
            stripeCustomerId: event.stripeCustomerId,
            stripeSubscriptionId: event.stripeSubscriptionId,
            subscriptionStatus: 'pro',
          },
        });
        return;
      case 'subscription_updated': {
        const user = await this.prisma.client.user.findFirst({
          where: { stripeCustomerId: event.stripeCustomerId },
        });
        if (!user) {
          throw new NotFoundException('No user matches this Stripe customer');
        }
        await this.prisma.client.user.update({
          where: { id: user.id },
          data: { subscriptionStatus: event.status === 'active' ? 'pro' : event.status },
        });
        return;
      }
      case 'subscription_deleted': {
        const user = await this.prisma.client.user.findFirst({
          where: { stripeCustomerId: event.stripeCustomerId },
        });
        if (!user) {
          throw new NotFoundException('No user matches this Stripe customer');
        }
        await this.prisma.client.user.update({
          where: { id: user.id },
          data: { subscriptionStatus: 'canceled' },
        });
        return;
      }
      case 'ignored':
        return;
    }
  }
}
