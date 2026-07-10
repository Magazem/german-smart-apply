import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CvController } from './cv.controller.js';
import { CvService } from './cv.service.js';

@Module({
  imports: [AuthModule],
  controllers: [CvController],
  providers: [CvService],
})
export class CvModule {}
