import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Minimum required fields mirror plan.md's free-tier onboarding: "3-5 short
 * questions" (target role, country, preferred language, seniority,
 * location/remote preference). Everything else is the paid-tier "deeper
 * profile settings" layer and stays optional.
 */
export class UpdateProfileDto {
  @IsString()
  @MinLength(1)
  targetRole!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(2)
  targetCountryCode!: string;

  @IsString()
  @MinLength(2)
  preferredLanguage!: string;

  @IsString()
  @IsIn(['intern', 'junior', 'mid', 'senior', 'lead', 'principal'])
  seniority!: string;

  @IsString()
  @IsIn(['onsite', 'hybrid', 'remote', 'any'])
  locationPreference!: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(100)
  skills?: string[];

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsInt()
  salaryTargetMin?: number;

  @IsOptional()
  @IsInt()
  salaryTargetMax?: number;

  @IsOptional()
  @IsString()
  workAuthorization?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  companyBlacklist?: string[];

  @IsOptional()
  @IsInt()
  commutePreferenceKm?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  portfolioLinks?: string[];
}
