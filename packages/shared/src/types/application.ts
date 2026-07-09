export const APPLICATION_STATUSES = [
  'new',
  'viewed',
  'saved',
  'draft_ready',
  'awaiting_approval',
  'applied',
  'interview',
  'rejected',
  'offer',
  'archived',
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export interface ApplicationDraft {
  id: string;
  applicationId: string;
  cvVariantText: string;
  coverLetterText: string;
  modelUsed: string;
  tokensUsed: number;
  createdAt: string;
}

export interface Application {
  id: string;
  userId: string;
  jobId: string;
  status: ApplicationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationEvent {
  id: string;
  applicationId: string;
  fromStatus: ApplicationStatus | null;
  toStatus: ApplicationStatus;
  note: string | null;
  createdAt: string;
}

const ALLOWED_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  new: ['viewed', 'saved', 'archived'],
  viewed: ['saved', 'draft_ready', 'archived'],
  saved: ['draft_ready', 'archived'],
  draft_ready: ['awaiting_approval', 'archived'],
  awaiting_approval: ['applied', 'draft_ready', 'archived'],
  applied: ['interview', 'rejected', 'archived'],
  interview: ['offer', 'rejected', 'archived'],
  rejected: ['archived'],
  offer: ['archived'],
  archived: [],
};

export function canTransition(from: ApplicationStatus, to: ApplicationStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
