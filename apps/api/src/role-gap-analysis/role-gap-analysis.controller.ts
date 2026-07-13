import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/jwt-payload.js';
import { RoleGapAnalysisService } from './role-gap-analysis.service.js';
import { CreateRoleGapAnalysisDto } from './dto/create-role-gap-analysis.dto.js';

@Controller('role-gap-analysis')
@UseGuards(JwtAuthGuard)
export class RoleGapAnalysisController {
  constructor(private readonly roleGapAnalysisService: RoleGapAnalysisService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.roleGapAnalysisService.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRoleGapAnalysisDto) {
    return this.roleGapAnalysisService.create(user.id, dto);
  }
}
