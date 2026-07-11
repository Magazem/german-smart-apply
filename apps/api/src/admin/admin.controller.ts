import { Controller, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AlertsService } from '../alerts/alerts.service.js';
import { AdminGuard } from './guards/admin.guard.js';
import { AdminService } from './admin.service.js';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly alertsService: AlertsService,
  ) {}

  @Get('sources')
  listSources() {
    return this.adminService.listSourcesWithHealth();
  }

  @Get('dedup-stats')
  dedupStats() {
    return this.adminService.dedupStats();
  }

  @Get('sources/:id/runs')
  async runHistory(@Param('id') id: string) {
    const result = await this.adminService.runHistory(id);
    if (!result) throw new NotFoundException('Source not found');
    return result;
  }

  // Manually-invokable only - no standing scheduler. See AlertsService's
  // own doc comment for why (deployment-level cron is a separate concern).
  @Post('alerts/run')
  runAlerts() {
    return this.alertsService.runAll();
  }
}
