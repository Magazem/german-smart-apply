import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BillingController } from './billing.controller.js';
import { BillingService } from './billing.service.js';
import { ProTierGuard } from './guards/pro-tier.guard.js';

@Module({
  imports: [AuthModule],
  controllers: [BillingController],
  providers: [BillingService, ProTierGuard],
  exports: [BillingService, ProTierGuard],
})
export class BillingModule {}
