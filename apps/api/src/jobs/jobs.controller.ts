import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/jwt-payload.js';
import { JobsService } from './jobs.service.js';
import { SearchJobsDto } from './dto/search-jobs.dto.js';

@Controller('jobs')
@UseGuards(OptionalJwtAuthGuard)
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get('search')
  search(@Query() filters: SearchJobsDto, @CurrentUser() user?: AuthenticatedUser) {
    return this.jobsService.search(filters, user?.id);
  }

  @Get(':id')
  getById(@Param('id') id: string, @CurrentUser() user?: AuthenticatedUser) {
    return this.jobsService.getById(id, user?.id);
  }
}
