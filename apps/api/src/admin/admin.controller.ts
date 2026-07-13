import { Body, Controller, Get, NotFoundException, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AlertsService } from '../alerts/alerts.service.js';
import { AdminGuard } from './guards/admin.guard.js';
import { AdminService } from './admin.service.js';
import { SetOpenRouterModelDto } from './dto/set-openrouter-model.dto.js';

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

  @Get('analytics')
  analytics() {
    return this.adminService.analytics();
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

  // Lets an admin A/B test free vs. paid OpenRouter models by typing any
  // slug in directly - takes effect immediately, no redeploy. See
  // AiProviderFactory for how that's possible.
  @Get('settings/openrouter-model')
  getOpenRouterModel() {
    return this.adminService.getOpenRouterModelOverride();
  }

  @Put('settings/openrouter-model')
  setOpenRouterModel(@Body() dto: SetOpenRouterModelDto) {
    return this.adminService.setOpenRouterModelOverride(dto.model);
  }
}
