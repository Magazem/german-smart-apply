import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SavedSearchesController } from './saved-searches.controller.js';
import { SavedSearchesService } from './saved-searches.service.js';

@Module({
  imports: [AuthModule],
  controllers: [SavedSearchesController],
  providers: [SavedSearchesService],
})
export class SavedSearchesModule {}
