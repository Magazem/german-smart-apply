import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RoleGapAnalysisController } from './role-gap-analysis.controller.js';
import { RoleGapAnalysisService } from './role-gap-analysis.service.js';

@Module({
  imports: [AuthModule],
  controllers: [RoleGapAnalysisController],
  providers: [RoleGapAnalysisService],
})
export class RoleGapAnalysisModule {}
