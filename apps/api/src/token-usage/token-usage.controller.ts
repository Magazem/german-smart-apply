import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/jwt-payload.js';
import { TokenUsageService } from './token-usage.service.js';

@Controller('usage')
@UseGuards(JwtAuthGuard)
export class TokenUsageController {
  constructor(private readonly tokenUsageService: TokenUsageService) {}

  @Get()
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.tokenUsageService.summaryForUser(user.id);
  }
}
