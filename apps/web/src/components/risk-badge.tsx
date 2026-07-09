import { riskLevel, trustLevel } from '@/lib/api-client';

export function RiskBadge({ scamRiskScore }: { scamRiskScore: number }) {
  const level = riskLevel(scamRiskScore);
  const label = {
    low: 'Low scam risk',
    medium: 'Medium scam risk — review before applying',
    high: 'High scam risk — verify carefully',
  }[level];
  const icon = { low: '✓', medium: '⚠', high: '⛔' }[level];
  return (
    <span className={`badge badge-${level}`} data-testid="risk-badge" data-risk-level={level}>
      {icon} {label}
    </span>
  );
}

export function TrustBadge({ sourceTrustScore }: { sourceTrustScore: number }) {
  const level = trustLevel(sourceTrustScore);
  const label = {
    low: 'Low source trust',
    medium: 'Medium source trust',
    high: 'High source trust',
  }[level];
  return (
    <span className={`badge badge-${level === 'high' ? 'success' : level === 'medium' ? 'warning' : 'danger'}`}>
      {label} ({Math.round(sourceTrustScore * 100)}%)
    </span>
  );
}
