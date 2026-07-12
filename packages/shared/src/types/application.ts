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

// 'standard' is free-tier; 'concise'/'leadership' require Pro (enforced in
// apps/api's ApplicationsService.generateDraft, not just the frontend).
export const CV_VARIANT_STYLES = ['standard', 'concise', 'leadership'] as const;
export type CvVariantStyle = (typeof CV_VARIANT_STYLES)[number];

export interface ApplicationDraft {
  id: string;
  applicationId: string;
  cvVariantText: string;
  coverLetterText: string;
  variantLabel: CvVariantStyle;
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
  // Includes itself: regenerating a draft (a different variant style, a
  // retry, etc.) while already draft_ready must not 409 - the frontend's
  // job-detail page keeps the "Request tailored CV & cover letter" button
  // active in this exact status for that reason. Was a latent gap this
  // never being called with `to === from` until multi-variant drafting.
  draft_ready: ['draft_ready', 'awaiting_approval', 'archived'],
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
