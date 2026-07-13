import { useTranslations } from 'next-intl';
import type { ApplicationStatus } from '@german-smart-apply/shared';

const STATUS_STYLE: Record<ApplicationStatus, string> = {
  new: 'badge-neutral',
  viewed: 'badge-neutral',
  saved: 'badge-neutral',
  draft_ready: 'badge-medium',
  awaiting_approval: 'badge-medium',
  applied: 'badge-success',
  interview: 'badge-success',
  offer: 'badge-success',
  rejected: 'badge-danger',
  archived: 'badge-neutral',
};

const STATUS_KEYS: Record<ApplicationStatus, string> = {
  new: 'statusNew',
  viewed: 'statusViewed',
  saved: 'statusSaved',
  draft_ready: 'statusDraftReady',
  awaiting_approval: 'statusAwaitingApproval',
  applied: 'statusApplied',
  interview: 'statusInterview',
  offer: 'statusOffer',
  rejected: 'statusRejected',
  archived: 'statusArchived',
};

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  const t = useTranslations('StatusBadge');
  return (
    <span className={`badge ${STATUS_STYLE[status]}`} data-testid="status-badge" data-status={status}>
      {t(STATUS_KEYS[status])}
    </span>
  );
}
