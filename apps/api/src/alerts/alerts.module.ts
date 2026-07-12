import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module.js';
import { AlertsService } from './alerts.service.js';

@Module({
  imports: [JobsModule],
  providers: [AlertsService],
  exports: [AlertsService],
})
export class AlertsModule {}
