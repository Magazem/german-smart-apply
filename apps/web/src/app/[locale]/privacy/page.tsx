import { useTranslations } from 'next-intl';

export const metadata = { title: 'Privacy Policy — Smart Apply' };

export default function PrivacyPage() {
  const t = useTranslations('Privacy');
  return (
    <div className="container" style={{ maxWidth: 760, padding: '48px 24px' }}>
      <div className="card stack gap-16" style={{ padding: 32 }}>
        <div className="stack gap-4">
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>{t('heading')}</h1>
          <p className="muted" style={{ fontSize: '0.85rem' }}>
            {t('versionNotice')}
          </p>
        </div>

        <section className="stack gap-8">
          <h2 style={{ fontSize: '1.1rem' }}>{t('section1Heading')}</h2>
          <p>{t('section1Body')}</p>
        </section>

        <section className="stack gap-8">
          <h2 style={{ fontSize: '1.1rem' }}>{t('section2Heading')}</h2>
          <p>{t('section2Body')}</p>
        </section>

        <section className="stack gap-8">
          <h2 style={{ fontSize: '1.1rem' }}>{t('section3Heading')}</h2>
          <p>{t('section3Body')}</p>
        </section>

        <section className="stack gap-8">
          <h2 style={{ fontSize: '1.1rem' }}>{t('section4Heading')}</h2>
          <p>{t('section4Body')}</p>
        </section>

        <section className="stack gap-8">
          <h2 style={{ fontSize: '1.1rem' }}>{t('section5Heading')}</h2>
          <p>{t('section5Body')}</p>
        </section>

        <section className="stack gap-8">
          <h2 style={{ fontSize: '1.1rem' }}>{t('section6Heading')}</h2>
          <p>{t('section6Body')}</p>
        </section>

        <section className="stack gap-8">
          <h2 style={{ fontSize: '1.1rem' }}>{t('section7Heading')}</h2>
          <p className="muted">{t('contactPlaceholder')}</p>
        </section>
      </div>
    </div>
  );
}
