import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module.js';
import { AiModule } from './ai/ai.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ProfileModule } from './profile/profile.module.js';
import { CvModule } from './cv/cv.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { ApplicationsModule } from './applications/applications.module.js';
import { SavedSearchesModule } from './saved-searches/saved-searches.module.js';
import { BillingModule } from './billing/billing.module.js';
import { TokenUsageModule } from './token-usage/token-usage.module.js';
import { AdminModule } from './admin/admin.module.js';
import { RoleGapAnalysisModule } from './role-gap-analysis/role-gap-analysis.module.js';

@Module({
  imports: [
    PrismaModule,
    AiModule,
    TokenUsageModule,
    AuthModule,
    ProfileModule,
    CvModule,
    JobsModule,
    ApplicationsModule,
    SavedSearchesModule,
    BillingModule,
    AdminModule,
    RoleGapAnalysisModule,
  ],
})
export class AppModule {}
