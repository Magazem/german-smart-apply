import { IsIn, IsOptional, IsString } from 'class-validator';
import { APPLICATION_STATUSES, type ApplicationStatus } from '@german-smart-apply/shared';

export class UpdateStatusDto {
  @IsString()
  @IsIn(APPLICATION_STATUSES)
  status!: ApplicationStatus;

  @IsOptional()
  @IsString()
  note?: string;
}
