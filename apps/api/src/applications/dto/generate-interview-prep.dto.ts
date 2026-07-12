import { IsOptional, IsString } from 'class-validator';

export class GenerateInterviewPrepDto {
  @IsOptional()
  @IsString()
  language?: string;
}
