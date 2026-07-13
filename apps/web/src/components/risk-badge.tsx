import { useTranslations } from 'next-intl';
import { riskLevel, trustLevel } from '@/lib/api-client';

export function RiskBadge({ scamRiskScore }: { scamRiskScore: number }) {
  const t = useTranslations('RiskBadge');
  const level = riskLevel(scamRiskScore);
  const label = {
    low: t('riskLow'),
    medium: t('riskMedium'),
    high: t('riskHigh'),
  }[level];
  const icon = { low: '✓', medium: '⚠', high: '⛔' }[level];
  return (
    <span className={`badge badge-${level}`} data-testid="risk-badge" data-risk-level={level}>
      {icon} {label}
    </span>
  );
}

export function TrustBadge({ sourceTrustScore }: { sourceTrustScore: number }) {
  const t = useTranslations('RiskBadge');
  const level = trustLevel(sourceTrustScore);
  const percent = Math.round(sourceTrustScore * 100);
  const label = {
    low: t('trustLow', { percent }),
    medium: t('trustMedium', { percent }),
    high: t('trustHigh', { percent }),
  }[level];
  return (
    <span className={`badge badge-${level === 'high' ? 'success' : level === 'medium' ? 'warning' : 'danger'}`}>
      {label}
    </span>
  );
}
