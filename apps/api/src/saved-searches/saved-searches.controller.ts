import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/jwt-payload.js';
import { SavedSearchesService } from './saved-searches.service.js';
import { CreateSavedSearchDto } from './dto/create-saved-search.dto.js';
import { UpdateSavedSearchDto } from './dto/update-saved-search.dto.js';

@Controller('saved-searches')
@UseGuards(JwtAuthGuard)
export class SavedSearchesController {
  constructor(private readonly savedSearchesService: SavedSearchesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.savedSearchesService.list(user.id);
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.savedSearchesService.getOne(user.id, id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSavedSearchDto) {
    return this.savedSearchesService.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateSavedSearchDto,
  ) {
    return this.savedSearchesService.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.savedSearchesService.remove(user.id, id);
  }
}
