import type { ApplicationStatus, RemoteType, Seniority } from '@german-smart-apply/shared';

export function formatSalary(min: number | null, max: number | null, currency: string | null): string {
  if (min == null && max == null) return 'Not disclosed';
  const cur = currency ?? 'EUR';
  const fmt = (n: number) => `${Math.round(n / 1000)}k`;
  if (min != null && max != null) return `${fmt(min)}–${fmt(max)} ${cur}`;
  if (min != null) return `From ${fmt(min)} ${cur}`;
  return `Up to ${fmt(max as number)} ${cur}`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return 'Unknown date';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatRelativeDate(iso: string | null): string {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months > 1 ? 's' : ''} ago`;
}

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  new: 'New',
  viewed: 'Viewed',
  saved: 'Saved',
  draft_ready: 'Draft ready',
  awaiting_approval: 'Awaiting your approval',
  applied: 'Applied',
  interview: 'Interview',
  rejected: 'Rejected',
  offer: 'Offer',
  archived: 'Archived',
};

export const STATUS_ORDER: ApplicationStatus[] = [
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
];

export function formatRemoteType(type: RemoteType): string {
  return { onsite: 'On-site', hybrid: 'Hybrid', remote: 'Remote' }[type];
}

export function formatSeniority(seniority: Seniority | null): string {
  if (!seniority) return 'Any level';
  return { intern: 'Intern', junior: 'Junior', mid: 'Mid-level', senior: 'Senior', lead: 'Lead', principal: 'Principal' }[
    seniority
  ];
}

export function formatEmploymentType(type: string): string {
  return type
    .split('_')
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(' ');
}

export function initials(name: string | null): string {
  if (!name) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}
