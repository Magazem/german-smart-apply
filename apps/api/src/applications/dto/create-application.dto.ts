import { IsString, IsUUID } from 'class-validator';

export class CreateApplicationDto {
  @IsString()
  @IsUUID()
  canonicalJobId!: string;
}
