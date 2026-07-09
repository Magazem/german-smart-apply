'use client';

import { useState } from 'react';
import { useRequireAuth } from '@/lib/use-require-auth';
import { useAuth } from '@/lib/auth-context';

const FREE_FEATURES = [
  'CV parsing + starter profile',
  'Top 5 trusted, deduplicated German job matches',
  'One example tailored cover letter',
  'Approval-first application queue',
  'Basic job search & filters',
];

const PRO_FEATURES = [
  'Everything in Free',
  'Unlimited matched jobs & saved searches',
  'Salary targets, work authorization, company blacklist',
  'Multiple CV variants per job',
  'Richer tailoring & interview prep notes',
  'Deeper application tracking & alerts',
];

export default function BillingPage() {
  const { loading } = useRequireAuth();
  const { user } = useAuth();
  const [message, setMessage] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="container" style={{ padding: '48px 24px' }}>
        <p className="muted">Loading…</p>
      </div>
    );
  }

  const handleUpgrade = () => {
    // TODO(billing workstream): wire real Stripe Checkout session creation
    // here once apps/api exposes a /billing/checkout-session endpoint.
    setMessage('Stripe checkout isn’t wired up yet — this button is a placeholder for the billing workstream.');
  };

  return (
    <div className="container stack gap-24" style={{ padding: '40px 24px 96px' }}>
      <div className="stack gap-4">
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>Billing</h1>
        <p className="muted">
          Free proves value fast. Pro unlocks deeper profile control and richer tailoring. Applications stay
          approval-first on every tier.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
        <div className="card stack gap-16" style={{ padding: 28 }}>
          <div className="row spread">
            <h2 style={{ fontWeight: 800, fontSize: '1.2rem' }}>Free</h2>
            {user?.tier === 'free' && <span className="badge badge-success">Current plan</span>}
          </div>
          <p style={{ fontSize: '1.8rem', fontWeight: 800 }}>
            €0<span className="muted" style={{ fontSize: '0.9rem', fontWeight: 500 }}> / month</span>
          </p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {FREE_FEATURES.map((f) => (
              <li key={f} style={{ fontSize: '0.9rem', marginBottom: 8 }}>
                {f}
              </li>
            ))}
          </ul>
        </div>

        <div className="card stack gap-16" style={{ padding: 28, border: '2px solid var(--color-primary)' }}>
          <div className="row spread">
            <h2 style={{ fontWeight: 800, fontSize: '1.2rem' }}>Pro</h2>
            {user?.tier === 'pro' ? (
              <span className="badge badge-success">Current plan</span>
            ) : (
              <span className="badge badge-neutral">Most popular</span>
            )}
          </div>
          <p style={{ fontSize: '1.8rem', fontWeight: 800 }}>
            €19<span className="muted" style={{ fontSize: '0.9rem', fontWeight: 500 }}> / month</span>
          </p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {PRO_FEATURES.map((f) => (
              <li key={f} style={{ fontSize: '0.9rem', marginBottom: 8 }}>
                {f}
              </li>
            ))}
          </ul>
          {user?.tier !== 'pro' && (
            <button type="button" className="btn btn-primary" onClick={handleUpgrade} data-testid="upgrade-cta">
              Upgrade to Pro
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className="card" style={{ padding: 16, background: 'var(--color-info-bg)', border: 'none' }}>
          <p style={{ fontSize: '0.88rem' }}>{message}</p>
        </div>
      )}

      <p className="muted" style={{ fontSize: '0.8rem' }}>
        Billing is powered by Stripe (subscriptions + usage metering) once wired up — this page is a functional
        placeholder ahead of that integration.
      </p>
    </div>
  );
}
