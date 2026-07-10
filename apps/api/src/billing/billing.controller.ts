import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/jwt-payload.js';
import { BillingService } from './billing.service.js';
import { BillingWebhookSignatureError } from './billing-provider.js';

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post('checkout-session')
  @UseGuards(JwtAuthGuard)
  createCheckoutSession(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.createCheckoutSession(user.id);
  }

  @Post('portal-session')
  @UseGuards(JwtAuthGuard)
  createPortalSession(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.createBillingPortalSession(user.id);
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  getStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.getStatus(user.id);
  }

  // Deliberately unauthenticated (Stripe calls this, not a logged-in user) -
  // trust is established entirely via the webhook signature, not a JWT.
  @Post('webhook')
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    if (!req.rawBody) {
      throw new BadRequestException('Raw request body is required for webhook verification');
    }
    try {
      await this.billingService.handleWebhookPayload(req.rawBody, signature);
    } catch (err) {
      if (err instanceof BillingWebhookSignatureError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
    return { received: true };
  }
}
