import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/jwt-payload.js';
import { JobsService } from './jobs.service.js';
import { SearchJobsDto } from './dto/search-jobs.dto.js';
import { RecordFeedbackDto } from './dto/record-feedback.dto.js';

@Controller('jobs')
@UseGuards(OptionalJwtAuthGuard)
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get('search')
  search(@Query() filters: SearchJobsDto, @CurrentUser() user?: AuthenticatedUser) {
    return this.jobsService.search(filters, user?.id);
  }

  // Split out of GET :id so the job-detail page can render immediately and
  // fill this block in when the model answers, instead of the whole page
  // waiting on the AI provider. Anonymous callers get `{ explanation: null }`.
  @Get(':id/match-explanation')
  getMatchExplanation(@Param('id') id: string, @CurrentUser() user?: AuthenticatedUser) {
    return this.jobsService.getMatchExplanation(id, user?.id);
  }

  @Get(':id')
  getById(@Param('id') id: string, @CurrentUser() user?: AuthenticatedUser) {
    return this.jobsService.getById(id, user?.id);
  }

  // Stacks on top of the controller-level OptionalJwtAuthGuard: that one
  // never rejects, so JwtAuthGuard here is what actually enforces auth —
  // recording feedback requires a real user, unlike browsing.
  @Post(':id/feedback')
  @UseGuards(JwtAuthGuard)
  recordFeedback(
    @Param('id') id: string,
    @Body() dto: RecordFeedbackDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jobsService.recordFeedback(user.id, id, dto.feedback);
  }
}
