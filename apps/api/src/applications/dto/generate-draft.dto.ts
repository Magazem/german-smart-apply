import { IsOptional, IsString } from 'class-validator';

export class GenerateDraftDto {
  @IsOptional()
  @IsString()
  language?: string;
}
