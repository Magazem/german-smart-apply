'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';

export default function SignupPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await getApiClient().auth.register({ email, password, fullName: fullName || undefined });
      await refresh();
      router.push('/onboarding');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your account.');
      setSubmitting(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: 440, padding: '56px 24px' }}>
      <div className="card stack gap-16" style={{ padding: 32 }}>
        <div className="stack gap-4">
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Create your free account</h1>
          <p className="muted" style={{ fontSize: '0.9rem' }}>
            Takes under a minute. You'll upload your CV and answer 5 quick questions next.
          </p>
        </div>

        <form onSubmit={onSubmit} className="stack" noValidate>
          <div className="field">
            <label htmlFor="fullName">Full name (optional)</label>
            <input
              id="fullName"
              className="input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
            />
          </div>
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
              data-testid="signup-email"
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              data-testid="signup-password"
            />
            <span className="field-hint">At least 8 characters.</span>
          </div>

          {error && <p className="error-text">{error}</p>}

          <button type="submit" className="btn btn-primary" disabled={submitting} data-testid="signup-submit">
            {submitting ? 'Creating account…' : 'Create account & continue'}
          </button>
        </form>

        <p className="muted" style={{ fontSize: '0.85rem', textAlign: 'center' }}>
          Already have an account?{' '}
          <Link href="/login" style={{ color: 'var(--color-primary)', fontWeight: 700 }}>
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
