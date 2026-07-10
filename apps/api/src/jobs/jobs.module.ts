import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { JobsController } from './jobs.controller.js';
import { JobsService } from './jobs.service.js';
import { RankingService } from './ranking.service.js';

@Module({
  imports: [AuthModule],
  controllers: [JobsController],
  providers: [JobsService, RankingService],
  exports: [JobsService, RankingService],
})
export class JobsModule {}
