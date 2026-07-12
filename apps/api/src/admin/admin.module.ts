import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AlertsModule } from '../alerts/alerts.module.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { AdminGuard } from './guards/admin.guard.js';

@Module({
  imports: [AuthModule, AlertsModule],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard],
})
export class AdminModule {}
