import { IsOptional, IsString } from 'class-validator';

export class GenerateFollowUpDto {
  @IsOptional()
  @IsString()
  language?: string;
}
