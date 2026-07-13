'use client';

import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { DEMO_EMAIL, DEMO_PASSWORD, getApiClient, isMockApi } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';

export default function LoginPage() {
  const t = useTranslations('Login');
  const router = useRouter();
  const { user, loading, refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace('/dashboard');
    }
  }, [loading, user, router]);

  const afterLogin = async () => {
    await refresh();
    const profile = await getApiClient().profile.get();
    router.push(profile?.targetRole ? '/dashboard' : '/onboarding');
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await getApiClient().auth.login({ email, password });
      await afterLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errorLoginFailed'));
      setSubmitting(false);
    }
  };

  const useDemoAccount = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await getApiClient().auth.login({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
      await afterLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errorLoginFailed'));
      setSubmitting(false);
    }
  };

  if (loading || user) {
    return null;
  }

  return (
    <div className="container" style={{ maxWidth: 440, padding: '56px 24px' }}>
      <div className="card stack gap-16" style={{ padding: 32 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>{t('pageTitle')}</h1>

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
              data-testid="login-email"
            />
          </div>
          <div className="field">
            <label htmlFor="password">{t('passwordLabel')}</label>
            <input
              id="password"
              type="password"
              required
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              data-testid="login-password"
            />
          </div>

          {error && <p className="error-text">{error}</p>}

          <button type="submit" className="btn btn-primary" disabled={submitting} data-testid="login-submit">
            {submitting ? t('submittingLabel') : t('submitLabel')}
          </button>
        </form>

        {isMockApi() && (
          <button type="button" className="btn btn-secondary" onClick={useDemoAccount} disabled={submitting}>
            {t('demoAccountButton')}
          </button>
        )}

        <p className="muted" style={{ fontSize: '0.85rem', textAlign: 'center' }}>
          {t('signupPrompt')}{' '}
          <Link href="/signup" style={{ color: 'var(--color-primary)', fontWeight: 700 }}>
            {t('signupLink')}
          </Link>
        </p>
      </div>
    </div>
  );
}
