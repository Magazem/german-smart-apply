'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { DEMO_EMAIL, DEMO_PASSWORD, getApiClient, isMockApi } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';

export default function LoginPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      setError(err instanceof Error ? err.message : 'Could not log you in.');
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
      setError(err instanceof Error ? err.message : 'Could not log you in.');
      setSubmitting(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: 440, padding: '56px 24px' }}>
      <div className="card stack gap-16" style={{ padding: 32 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Log in</h1>

        <form onSubmit={onSubmit} className="stack" noValidate>
          <div className="field">
            <label htmlFor="email">Email</label>
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
            <label htmlFor="password">Password</label>
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
            {submitting ? 'Logging in…' : 'Log in'}
          </button>
        </form>

        {isMockApi() && (
          <button type="button" className="btn btn-secondary" onClick={useDemoAccount} disabled={submitting}>
            Use demo account (no signup needed)
          </button>
        )}

        <p className="muted" style={{ fontSize: '0.85rem', textAlign: 'center' }}>
          New here?{' '}
          <Link href="/signup" style={{ color: 'var(--color-primary)', fontWeight: 700 }}>
            Create a free account
          </Link>
        </p>
      </div>
    </div>
  );
}
