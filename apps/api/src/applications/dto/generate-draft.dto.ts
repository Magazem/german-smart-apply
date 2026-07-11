import { IsIn, IsOptional, IsString } from 'class-validator';
import { CV_VARIANT_STYLES, type CvVariantStyle } from '@german-smart-apply/shared';

export class GenerateDraftDto {
  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  @IsIn(CV_VARIANT_STYLES)
  variantStyle?: CvVariantStyle;
}
