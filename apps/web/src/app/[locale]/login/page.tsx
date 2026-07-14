'use client';

import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import type { CandidateProfile } from '@german-smart-apply/shared';
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

  // Bounces an already-authenticated visitor who lands directly on /login.
  // Guarded by !submitting for the same reason as signup/page.tsx: logging
  // in also authenticates (refresh() inside afterLogin sets `user`), and
  // this effect re-running on that same state change would otherwise race
  // afterLogin's own profile-aware router.push below - a returning user
  // with an incomplete profile could get bounced straight to /dashboard
  // instead of back to /onboarding. `submitting` stays true for the whole
  // success path (only reset to false in the catch branches), so it
  // reliably suppresses this guard until afterLogin's navigation has
  // already been issued.
  useEffect(() => {
    if (!loading && user && !submitting) {
      router.replace('/dashboard');
    }
  }, [loading, user, submitting, router]);

  const afterLogin = async () => {
    await refresh();
    // Login itself already succeeded by this point (refresh() set `user`) -
    // a failure here is just "couldn't check the profile to route smartly",
    // not an auth failure. Letting it throw would reach onSubmit's catch
    // below, which sets submitting=false while `user` is already truthy -
    // exactly the condition the bounce-guard effect above is watching for,
    // so it would force a navigate to /dashboard right out from under a
    // "login failed" message the user never actually earned. Falling back
    // to /onboarding (the same destination a genuinely profile-less user
    // gets) keeps this failure mode a routing fallback, not a fake login error.
    let profile: CandidateProfile | null = null;
    try {
      profile = await getApiClient().profile.get();
    } catch {
      // Swallowed deliberately - see comment above.
    }
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
