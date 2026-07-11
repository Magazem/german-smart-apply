'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { initials } from '@/lib/format';

const LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/jobs', label: 'Job search' },
  { href: '/applications', label: 'Applications' },
  { href: '/cv', label: 'CV workspace' },
  { href: '/billing', label: 'Billing' },
];

export function Nav() {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

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
      <div className="container row spread" style={{ height: 64 }}>
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
          Smart Apply
        </Link>

        {!loading && user && (
          <nav className="row gap-16" style={{ flex: 1, justifyContent: 'center' }} aria-label="Primary">
            {(user.role === 'admin' ? [...LINKS, { href: '/admin', label: 'Admin' }] : LINKS).map((link) => {
              const active = pathname === link.href || pathname?.startsWith(`${link.href}/`);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  style={{
                    textDecoration: 'none',
                    fontSize: '0.9rem',
                    fontWeight: active ? 700 : 500,
                    color: active ? 'var(--color-primary)' : 'var(--color-text-muted)',
                    padding: '8px 4px',
                    borderBottom: active ? '2px solid var(--color-primary)' : '2px solid transparent',
                  }}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        )}

        <div className="row gap-12">
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
                Log out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost btn-sm">
                Log in
              </Link>
              <Link href="/signup" className="btn btn-primary btn-sm">
                Get started free
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
