'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth-context';
import { initials } from '@/lib/format';
import { ThemeToggle } from './theme-toggle';
import { LanguageSwitcher } from './language-switcher';

const LINK_KEYS = [
  { href: '/dashboard', key: 'dashboard' },
  { href: '/jobs', key: 'jobs' },
  { href: '/saved-searches', key: 'savedSearches' },
  { href: '/applications', key: 'applications' },
  { href: '/cv', key: 'cv' },
  { href: '/career-coach', key: 'careerCoach' },
  { href: '/billing', key: 'billing' },
] as const;

export function Nav() {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('Nav');

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  const links = user?.role === 'admin' ? [...LINK_KEYS, { href: '/admin', key: 'admin' } as const] : LINK_KEYS;

  return (
    <header
      style={{
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-surface)',
        position: 'sticky',
        top: 0,
        zIndex: 20,
      }}
    >
      <div className="container row spread" style={{ minHeight: 64, padding: '10px 0' }}>
        <Link href="/" className="row gap-8" style={{ textDecoration: 'none', fontWeight: 800, fontSize: '1.05rem' }}>
          <span
            aria-hidden
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: 'var(--color-primary)',
              color: 'var(--color-primary-contrast)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.85rem',
            }}
          >
            SA
          </span>
          {t('brand')}
        </Link>

        {!loading && user && (
          <nav
            className="row row-wrap"
            style={{ flex: 1, justifyContent: 'center', gap: 'var(--nav-link-gap, 16px)' }}
            aria-label="Primary"
          >
            {links.map((link) => {
              const active = pathname === link.href || pathname?.startsWith(`${link.href}/`);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  style={{
                    textDecoration: 'none',
                    fontSize: 'var(--nav-link-size, 0.9rem)',
                    fontWeight: active ? 700 : 500,
                    color: active ? 'var(--color-primary)' : 'var(--color-text-muted)',
                    padding: '8px 4px',
                    whiteSpace: 'nowrap',
                    borderBottom: active ? '2px solid var(--color-primary)' : '2px solid transparent',
                  }}
                >
                  {t(link.key)}
                </Link>
              );
            })}
          </nav>
        )}

        <div className="row gap-12">
          <LanguageSwitcher />
          <ThemeToggle />
          {loading ? null : user ? (
            <>
              <span
                title={user.email}
                className="row gap-8"
                style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: 'var(--color-surface-alt)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                  }}
                >
                  {initials(user.fullName ?? user.email)}
                </span>
                <span className="badge badge-neutral" style={{ textTransform: 'uppercase' }}>
                  {user.tier}
                </span>
              </span>
              <button className="btn btn-ghost btn-sm" onClick={handleLogout} data-testid="logout-button">
                {t('logOut')}
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost btn-sm">
                {t('logIn')}
              </Link>
              <Link href="/signup" className="btn btn-primary btn-sm">
                {t('getStarted')}
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
