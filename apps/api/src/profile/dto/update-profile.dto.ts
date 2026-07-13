import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ExperienceEntryDto {
  @IsString()
  title!: string;

  @IsString()
  company!: string;

  @IsOptional()
  @IsString()
  startDate!: string | null;

  @IsOptional()
  @IsString()
  endDate!: string | null;

  @IsString()
  description!: string;
}

export class EducationEntryDto {
  @IsString()
  degree!: string;

  @IsString()
  institution!: string;

  @IsOptional()
  startYear!: number | null;

  @IsOptional()
  endYear!: number | null;
}

/**
 * Mirrors the shared ApiClient contract's `profile.update(patch: Partial<CandidateProfile>)`
 * - every field is a partial-update candidate, none are required on the DTO
 * itself. plan.md's free-tier onboarding ("3-5 short questions": target
 * role, country, preferred language, seniority, location/remote preference)
 * is a *product* flow spread across multiple partial saves (CV-parse
 * prefill, then the questions step), not a single all-fields-required
 * request - ProfileService fills in placeholder defaults for anything still
 * missing when a profile is first created, the same way CV upload's own
 * prefill already does.
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  targetRole?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(2)
  targetCountryCode?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  preferredLanguage?: string;

  @IsOptional()
  @IsString()
  @IsIn(['intern', 'junior', 'mid', 'senior', 'lead', 'principal'])
  seniority?: string;

  @IsOptional()
  @IsString()
  @IsIn(['onsite', 'hybrid', 'remote', 'any'])
  locationPreference?: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(100)
  skills?: string[];

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ExperienceEntryDto)
  experience?: ExperienceEntryDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => EducationEntryDto)
  education?: EducationEntryDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  languages?: string[];

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
