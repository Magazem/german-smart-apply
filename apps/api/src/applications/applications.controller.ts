import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/jwt-payload.js';
import { ApplicationsService } from './applications.service.js';
import { CreateApplicationDto } from './dto/create-application.dto.js';
import { UpdateStatusDto } from './dto/update-status.dto.js';
import { GenerateDraftDto } from './dto/generate-draft.dto.js';
import { GenerateFollowUpDto } from './dto/generate-follow-up.dto.js';

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

  @Get(':id/follow-ups')
  listFollowUps(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.applicationsService.listFollowUps(user.id, id);
  }

  @Post(':id/follow-up')
  generateFollowUp(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: GenerateFollowUpDto,
  ) {
    return this.applicationsService.generateFollowUp(user.id, id, dto.language);
  }

  @Get(':id/pdf')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'attachment; filename="application.pdf"')
  async downloadPdf(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('draftId') draftId?: string,
  ) {
    const pdf = await this.applicationsService.generatePdf(user.id, id, draftId);
    return new StreamableFile(pdf);
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
