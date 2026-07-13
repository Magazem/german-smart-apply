import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * A blank/omitted model clears the override (falls back to OPENROUTER_MODEL
 * / the hardcoded default) - not an error, a deliberate "stop overriding" signal.
 */
export class SetOpenRouterModelDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  model?: string | null;
}
