import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ProfileModule } from './profile/profile.module.js';
import { CvModule } from './cv/cv.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { ApplicationsModule } from './applications/applications.module.js';
import { SavedSearchesModule } from './saved-searches/saved-searches.module.js';
import { BillingModule } from './billing/billing.module.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    ProfileModule,
    CvModule,
    JobsModule,
    ApplicationsModule,
    SavedSearchesModule,
    BillingModule,
  ],
})
export class AppModule {}
