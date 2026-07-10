import type { ApplicationStatus } from '@german-smart-apply/shared';
import { STATUS_LABELS } from '@/lib/format';

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

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <span className={`badge ${STATUS_STYLE[status]}`} data-testid="status-badge" data-status={status}>
      {STATUS_LABELS[status]}
    </span>
  );
}
