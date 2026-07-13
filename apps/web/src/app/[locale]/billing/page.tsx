'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useRequireAuth } from '@/lib/use-require-auth';
import { useAuth } from '@/lib/auth-context';
import { getApiClient } from '@/lib/api-client';
import type { TokenUsageSummary } from '@/lib/api/types';

const FREE_FEATURE_KEYS = [
  'freeFeature1',
  'freeFeature2',
  'freeFeature3',
  'freeFeature4',
  'freeFeature5',
] as const;

const PRO_FEATURE_KEYS = [
  'proFeature1',
  'proFeature2',
  'proFeature3',
  'proFeature4',
  'proFeature5',
  'proFeature6',
] as const;

const FEATURE_LABEL_KEYS: Record<string, string> = {
  parseCv: 'featureParseCv',
  cvVariant: 'featureCvVariant',
  coverLetter: 'featureCoverLetter',
  matchExplanation: 'featureMatchExplanation',
};

export default function BillingPage() {
  const t = useTranslations('Billing');
  const { loading } = useRequireAuth();
  const { user } = useAuth();
  const [message, setMessage] = useState<string | null>(null);
  const [usage, setUsage] = useState<TokenUsageSummary | null>(null);

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    void getApiClient()
      .usage.summary()
      .then((result) => {
        if (!cancelled) setUsage(result);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [loading]);

  if (loading) {
    return (
      <div className="container" style={{ padding: '48px 24px' }}>
        <p className="muted">{t('loading')}</p>
      </div>
    );
  }

  const handleUpgrade = () => {
    // TODO(billing workstream): wire real Stripe Checkout session creation
    // here once apps/api exposes a /billing/checkout-session endpoint.
    setMessage(t('checkoutPlaceholder'));
  };

  return (
    <div className="container stack gap-24" style={{ padding: '40px 24px 96px' }}>
      <div className="stack gap-4">
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>{t('pageTitle')}</h1>
        <p className="muted">{t('pageSubtitle')}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
        <div className="card stack gap-16" style={{ padding: 28 }}>
          <div className="row spread">
            <h2 style={{ fontWeight: 800, fontSize: '1.2rem' }}>{t('freeTitle')}</h2>
            {user?.tier === 'free' && <span className="badge badge-success">{t('currentPlan')}</span>}
          </div>
          <p style={{ fontSize: '1.8rem', fontWeight: 800 }}>
            €0<span className="muted" style={{ fontSize: '0.9rem', fontWeight: 500 }}> {t('perMonth')}</span>
          </p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {FREE_FEATURE_KEYS.map((key) => (
              <li key={key} style={{ fontSize: '0.9rem', marginBottom: 8 }}>
                {t(key)}
              </li>
            ))}
          </ul>
        </div>

        <div className="card stack gap-16" style={{ padding: 28, border: '2px solid var(--color-primary)' }}>
          <div className="row spread">
            <h2 style={{ fontWeight: 800, fontSize: '1.2rem' }}>{t('proTitle')}</h2>
            {user?.tier === 'pro' ? (
              <span className="badge badge-success">{t('currentPlan')}</span>
            ) : (
              <span className="badge badge-neutral">{t('mostPopular')}</span>
            )}
          </div>
          <p style={{ fontSize: '1.8rem', fontWeight: 800 }}>
            €19<span className="muted" style={{ fontSize: '0.9rem', fontWeight: 500 }}> {t('perMonth')}</span>
          </p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {PRO_FEATURE_KEYS.map((key) => (
              <li key={key} style={{ fontSize: '0.9rem', marginBottom: 8 }}>
                {t(key)}
              </li>
            ))}
          </ul>
          {user?.tier !== 'pro' && (
            <button type="button" className="btn btn-primary" onClick={handleUpgrade} data-testid="upgrade-cta">
              {t('upgradeButton')}
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className="card" style={{ padding: 16, background: 'var(--color-info-bg)', border: 'none' }}>
          <p style={{ fontSize: '0.88rem' }}>{message}</p>
        </div>
      )}

      {usage && (
        <div className="card stack gap-12" style={{ padding: 24 }}>
          <div className="stack gap-4">
            <h2 style={{ fontWeight: 700, fontSize: '1.05rem' }}>{t('usageTitle')}</h2>
            <p className="muted" style={{ fontSize: '0.82rem' }}>
              {t('usageSubtitle')}
            </p>
          </div>
          {usage.totalTokens === 0 ? (
            <p className="muted" style={{ fontSize: '0.88rem' }}>{t('noUsageYet')}</p>
          ) : (
            <>
              <p style={{ fontWeight: 700, fontSize: '1.1rem' }}>{t('tokensTotal', { count: usage.totalTokens.toLocaleString() })}</p>
              <div className="stack gap-8">
                {usage.byFeature.map((f) => (
                  <div key={f.feature} className="row spread" style={{ fontSize: '0.85rem' }}>
                    <span>
                      {FEATURE_LABEL_KEYS[f.feature] ? t(FEATURE_LABEL_KEYS[f.feature]) : f.feature}{' '}
                      <span className="muted">{t('callCount', { count: f.callCount })}</span>
                    </span>
                    <span className="muted">{t('tokensUsed', { count: f.tokensUsed.toLocaleString() })}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <p className="muted" style={{ fontSize: '0.8rem' }}>
        {t('stripePlaceholderNote')}
      </p>
    </div>
  );
}
