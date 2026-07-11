import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/jwt-payload.js';
import { ApplicationsService } from './applications.service.js';
import { CreateApplicationDto } from './dto/create-application.dto.js';
import { UpdateStatusDto } from './dto/update-status.dto.js';
import { GenerateDraftDto } from './dto/generate-draft.dto.js';

@Controller('applications')
@UseGuards(JwtAuthGuard)
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.applicationsService.list(user.id);
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.applicationsService.getOne(user.id, id);
  }

  @Get(':id/draft')
  getLatestDraft(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.applicationsService.getLatestDraft(user.id, id);
  }

  // Plural, distinct from GET :id/draft above - every generated variant for
  // this application, not just the latest, so the UI can compare/pick.
  @Get(':id/drafts')
  listDrafts(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.applicationsService.listDrafts(user.id, id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateApplicationDto) {
    return this.applicationsService.create(user.id, dto);
  }

  @Post(':id/draft')
  generateDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: GenerateDraftDto,
  ) {
    return this.applicationsService.generateDraft(user.id, id, dto.language, dto.variantStyle);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.applicationsService.updateStatus(user.id, id, dto);
  }
}
