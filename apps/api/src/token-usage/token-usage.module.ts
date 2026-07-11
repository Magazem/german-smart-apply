import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { TokenUsageController } from './token-usage.controller.js';
import { TokenUsageService } from './token-usage.service.js';

// @Global(), same as PrismaModule: cv/jobs/applications modules all need to
// record usage from otherwise-unrelated feature code, not just this
// module's own controller.
@Global()
@Module({
  imports: [AuthModule],
  controllers: [TokenUsageController],
  providers: [TokenUsageService],
  exports: [TokenUsageService],
})
export class TokenUsageModule {}
