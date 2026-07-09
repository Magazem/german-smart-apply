import Link from 'next/link';
import type { CanonicalJob, JobMatchScore } from '@german-smart-apply/shared';
import { formatEmploymentType, formatRelativeDate, formatRemoteType, formatSeniority, formatSalary } from '@/lib/format';
import { MatchScoreBar } from './match-score';
import { RiskBadge } from './risk-badge';

export function JobCard({
  job,
  match,
  whyMatch,
}: {
  job: CanonicalJob;
  match?: JobMatchScore | null;
  whyMatch?: string;
}) {
  return (
    <article className="card" data-testid="job-card" data-job-id={job.jobId} style={{ padding: 20 }}>
      <div className="row spread" style={{ alignItems: 'flex-start' }}>
        <div className="stack gap-4" style={{ flex: 1, minWidth: 0 }}>
          <Link
            href={`/jobs/${job.jobId}`}
            style={{ textDecoration: 'none', fontWeight: 700, fontSize: '1.05rem' }}
            data-testid="job-card-title"
          >
            {job.jobTitleNormalized}
          </Link>
          <span className="muted" style={{ fontSize: '0.9rem' }}>
            {job.companyNameNormalized} &middot; {job.locationNormalized} &middot; {formatRemoteType(job.remoteType)}
          </span>
        </div>
        {match && <MatchScoreBar match={match} compact />}
      </div>

      <div className="row row-wrap gap-8" style={{ marginTop: 12 }}>
        <span className="tag">{formatSeniority(job.seniority)}</span>
        <span className="tag">{formatEmploymentType(job.employmentType)}</span>
        <span className="tag">{formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency)}</span>
        <span className="tag">Posted {formatRelativeDate(job.postedAt)}</span>
      </div>

      <div className="row row-wrap gap-8" style={{ marginTop: 10 }}>
        {job.techStackTags.slice(0, 6).map((tag) => (
          <span
            key={tag}
            className="tag"
            style={{ background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)' }}
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="row spread" style={{ marginTop: 14, alignItems: 'center' }}>
        <RiskBadge scamRiskScore={job.scamRiskScore} />
        <Link href={`/jobs/${job.jobId}`} className="btn btn-secondary btn-sm">
          View details
        </Link>
      </div>

      {whyMatch && (
        <p className="muted" style={{ marginTop: 12, fontSize: '0.85rem', borderTop: '1px dashed var(--color-border)', paddingTop: 10 }}>
          <strong style={{ color: 'var(--color-text)' }}>Why this matches: </strong>
          {whyMatch}
        </p>
      )}
    </article>
  );
}
