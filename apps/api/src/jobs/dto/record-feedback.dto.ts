import { IsIn, IsString } from 'class-validator';
import { JOB_FEEDBACK_TYPES, type JobFeedbackType } from '@german-smart-apply/shared';

export class RecordFeedbackDto {
  @IsString()
  @IsIn(JOB_FEEDBACK_TYPES)
  feedback!: JobFeedbackType;
}
