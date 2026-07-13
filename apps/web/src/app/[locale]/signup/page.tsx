'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';

/** Bump whenever /terms or /privacy content materially changes, so ConsentRecord rows stay auditable. */
export const CURRENT_POLICY_VERSION = '1.0';

function usePasswordStrength(password: string) {
  const t = useTranslations('Signup');
  return useMemo(() => {
    const missing: string[] = [];
    if (password.length < 10) missing.push(t('needsLength'));
    if (!/[a-z]/.test(password)) missing.push(t('needsLower'));
    if (!/[A-Z]/.test(password)) missing.push(t('needsUpper'));
    if (!/\d/.test(password)) missing.push(t('needsNumber'));

    const score = 4 - missing.length;
    const labels = [
      t('strengthTooWeak'),
      t('strengthWeak'),
      t('strengthFair'),
      t('strengthGood'),
      t('strengthStrong'),
    ];
    return { score, label: labels[score], missing };
  }, [password, t]);
}

export default function SignupPage() {
  const router = useRouter();
  const { user, loading, refresh } = useAuth();
  const t = useTranslations('Signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const strength = usePasswordStrength(password);

  useEffect(() => {
    if (!loading && user) {
      router.replace('/dashboard');
    }
  }, [loading, user, router]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await getApiClient().auth.register({
        email,
        password,
        acceptedTerms,
        acceptedPolicyVersion: CURRENT_POLICY_VERSION,
      });
      await refresh();
      router.push('/onboarding');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('genericError'));
      setSubmitting(false);
    }
  };

  if (loading || user) {
    return null;
  }

  return (
    <div className="container" style={{ maxWidth: 440, padding: '56px 24px' }}>
      <div className="card stack gap-16" style={{ padding: 32 }}>
        <div className="stack gap-4">
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>{t('heading')}</h1>
          <p className="muted" style={{ fontSize: '0.9rem' }}>
            {t('subtitle')}
          </p>
        </div>

        <form onSubmit={onSubmit} className="stack" noValidate>
          <div className="field">
            <label htmlFor="email">{t('emailLabel')}</label>
            <input
              id="email"
              type="email"
              required
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              data-testid="signup-email"
            />
          </div>
          <div className="field">
            <label htmlFor="password">{t('passwordLabel')}</label>
            <input
              id="password"
              type="password"
              required
              minLength={10}
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              data-testid="signup-password"
            />
            <span className="field-hint">{t('passwordHint')}</span>
            {password.length > 0 && (
              <div data-testid="password-strength" data-strength-score={strength.score} style={{ marginTop: 6 }}>
                <div
                  style={{
                    height: 4,
                    borderRadius: 2,
                    background: 'var(--color-border)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${(strength.score / 4) * 100}%`,
                      background:
                        strength.score >= 4
                          ? 'var(--color-primary)'
                          : strength.score >= 2
                            ? 'var(--color-accent)'
                            : 'var(--color-danger)',
                      transition: 'width 150ms ease',
                    }}
                  />
                </div>
                <span className="field-hint">
                  {strength.label}
                  {strength.missing.length > 0 ? t('stillNeeds', { items: strength.missing.join(', ') }) : ''}
                </span>
              </div>
            )}
          </div>

          <div className="field">
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontWeight: 400 }}>
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                data-testid="signup-accept-terms"
                style={{ marginTop: 3 }}
              />
              <span style={{ fontSize: '0.85rem' }}>
                {t('consentPrefix')}{' '}
                <Link href="/terms" target="_blank" style={{ color: 'var(--color-primary)', fontWeight: 700 }}>
                  {t('termsOfService')}
                </Link>{' '}
                {t('consentAnd')}{' '}
                <Link href="/privacy" target="_blank" style={{ color: 'var(--color-primary)', fontWeight: 700 }}>
                  {t('privacyPolicy')}
                </Link>
                .
              </span>
            </label>
          </div>

          {error && <p className="error-text">{error}</p>}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting || !acceptedTerms}
            data-testid="signup-submit"
          >
            {submitting ? t('submitPending') : t('submitIdle')}
          </button>
        </form>

        <p className="muted" style={{ fontSize: '0.85rem', textAlign: 'center' }}>
          {t('hasAccount')}{' '}
          <Link href="/login" style={{ color: 'var(--color-primary)', fontWeight: 700 }}>
            {t('logIn')}
          </Link>
        </p>
      </div>
    </div>
  );
}
