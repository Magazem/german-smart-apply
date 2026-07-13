import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateRoleGapAnalysisDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  targetRole!: string;

  @IsOptional()
  @IsString()
  language?: string;
}
