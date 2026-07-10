import {
  Body,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/jwt-payload.js';
import { CvService } from './cv.service.js';

@Controller('cv')
@UseGuards(JwtAuthGuard)
export class CvController {
  constructor(private readonly cvService: CvService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
    @Body('language') language?: string,
  ) {
    return this.cvService.uploadAndParse(user.id, file, language ?? 'en');
  }

  @Get('last')
  getLastParsed(@CurrentUser() user: AuthenticatedUser) {
    return this.cvService.getLastParsed(user.id);
  }
}
