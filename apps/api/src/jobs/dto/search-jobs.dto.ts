import { REMOTE_TYPES, SENIORITIES, SOURCE_TYPES } from '@german-smart-apply/shared';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

// Imported from @german-smart-apply/shared rather than re-declared here. The
// local copies these replace had fallen behind: SOURCE_TYPES was missing
// 'personio' and 'smartrecruiters', so a filter on either - both shipped
// adapters, both listed in shared's SourceType - was rejected with a 400
// naming them as invalid values.

function toArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value.map(String);
  return String(value)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

/** Mirrors @german-smart-apply/shared's `JobSearchFilters`, adapted for query-string input. */
export class SearchJobsDto {
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @Transform(({ value }) => toArray(value))
  @IsArray()
  @IsString({ each: true })
  stack?: string[];

  @IsOptional()
  @IsString()
  locationCountryCode?: string;

  @IsOptional()
  @Transform(({ value }) => toArray(value))
  @IsArray()
  @IsIn(REMOTE_TYPES, { each: true })
  remoteType?: string[];

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  salaryMin?: number;

  @IsOptional()
  @Transform(({ value }) => toArray(value))
  @IsArray()
  @IsIn(SENIORITIES, { each: true })
  seniority?: string[];

  @IsOptional()
  @Transform(({ value }) => toArray(value))
  @IsArray()
  @IsIn(SOURCE_TYPES, { each: true })
  sourceType?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
