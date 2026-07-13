'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth-context';

const PILLAR_KEYS = [
  { titleKey: 'pillar1Title', bodyKey: 'pillar1Body' },
  { titleKey: 'pillar2Title', bodyKey: 'pillar2Body' },
  { titleKey: 'pillar3Title', bodyKey: 'pillar3Body' },
  { titleKey: 'pillar4Title', bodyKey: 'pillar4Body' },
] as const;

const STEP_KEYS = [
  { n: '1', labelKey: 'step1Label', bodyKey: 'step1Body' },
  { n: '2', labelKey: 'step2Label', bodyKey: 'step2Body' },
  { n: '3', labelKey: 'step3Label', bodyKey: 'step3Body' },
] as const;

export default function LandingPage() {
  const t = useTranslations('Landing');
  const { user, loading } = useAuth();

  return (
    <div>
      <section style={{ padding: '72px 0 56px' }}>
        <div className="container stack gap-24" style={{ maxWidth: 760, textAlign: 'center', margin: '0 auto' }}>
          <span className="badge badge-neutral" style={{ alignSelf: 'center' }}>
            {t('badge')}
          </span>
          <h1 style={{ fontSize: '2.6rem', fontWeight: 800, lineHeight: 1.15 }}>{t('heroHeading')}</h1>
          <p className="muted" style={{ fontSize: '1.15rem' }}>
            {t('heroSubtitle')}
          </p>
          <div className="row gap-12" style={{ justifyContent: 'center' }}>
            {loading ? null : user ? (
              <Link href="/dashboard" className="btn btn-primary" data-testid="cta-dashboard" style={{ padding: '14px 28px' }}>
                {t('ctaDashboard')}
              </Link>
            ) : (
              <>
                <Link href="/signup" className="btn btn-primary" data-testid="cta-signup" style={{ padding: '14px 28px' }}>
                  {t('ctaSignup')}
                </Link>
                <Link href="/login" className="btn btn-secondary" style={{ padding: '14px 28px' }}>
                  {t('ctaLogin')}
                </Link>
              </>
            )}
          </div>
          <p className="muted" style={{ fontSize: '0.85rem' }}>
            {t('heroFootnote')}
          </p>
        </div>
      </section>

      <section style={{ padding: '48px 0', background: 'var(--color-surface)' }}>
        <div className="container">
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, textAlign: 'center', marginBottom: 32 }}>
            {t('stepsHeading')}
          </h2>
          <div className="row row-wrap gap-24" style={{ justifyContent: 'center' }}>
            {STEP_KEYS.map((s) => (
              <div key={s.n} className="card stack gap-8" style={{ padding: 24, width: 280 }}>
                <span
                  aria-hidden
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: 'var(--color-primary)',
                    color: 'var(--color-primary-contrast)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                  }}
                >
                  {s.n}
                </span>
                <h3 style={{ fontWeight: 700 }}>{t(s.labelKey)}</h3>
                <p className="muted" style={{ fontSize: '0.9rem' }}>
                  {t(s.bodyKey)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: '56px 0' }}>
        <div className="container">
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, textAlign: 'center', marginBottom: 32 }}>
            {t('pillarsHeading')}
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 20,
            }}
          >
            {PILLAR_KEYS.map((p) => (
              <div key={p.titleKey} className="card stack gap-8" style={{ padding: 22 }}>
                <h3 style={{ fontWeight: 700, fontSize: '1.02rem' }}>{t(p.titleKey)}</h3>
                <p className="muted" style={{ fontSize: '0.9rem' }}>
                  {t(p.bodyKey)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: '56px 0 88px' }}>
        <div className="card container" style={{ maxWidth: 760, padding: 40, textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>{t('finalCtaHeading')}</h2>
          <p className="muted" style={{ marginTop: 10 }}>
            {t('finalCtaBody')}
          </p>
          {!loading && (
            <Link
              href={user ? '/dashboard' : '/signup'}
              className="btn btn-primary"
              style={{ marginTop: 20, padding: '14px 28px' }}
            >
              {user ? t('ctaDashboard') : t('ctaSignup')}
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
