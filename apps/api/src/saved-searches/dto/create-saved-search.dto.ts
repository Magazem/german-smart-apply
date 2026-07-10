import { IsBoolean, IsObject, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateSavedSearchDto {
  @IsString()
  @MinLength(1)
  name!: string;

  /** A `JobSearchFilters`-shaped object, persisted as-is and replayed by the alerting worker. */
  @IsObject()
  filters!: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
