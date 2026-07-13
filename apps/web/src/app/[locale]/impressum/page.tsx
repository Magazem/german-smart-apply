import { useTranslations } from 'next-intl';

export const metadata = { title: 'Impressum — Smart Apply' };

export default function ImpressumPage() {
  const t = useTranslations('Impressum');
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
          <h2 style={{ fontSize: '1.1rem' }}>{t('legalHeading')}</h2>
          <p className="muted">
            {t('legalNamePlaceholder')}
            <br />
            {t('streetPlaceholder')}
            <br />
            {t('cityPlaceholder')}
            <br />
            {t('countryPlaceholder')}
          </p>
        </section>

        <section className="stack gap-8">
          <h2 style={{ fontSize: '1.1rem' }}>{t('contactHeading')}</h2>
          <p className="muted">
            {t('emailPlaceholder')}
            <br />
            {t('phonePlaceholder')}
          </p>
        </section>

        <section className="stack gap-8">
          <h2 style={{ fontSize: '1.1rem' }}>{t('representedByHeading')}</h2>
          <p className="muted">{t('representedByPlaceholder')}</p>
        </section>

        <section className="stack gap-8">
          <h2 style={{ fontSize: '1.1rem' }}>{t('registerHeading')}</h2>
          <p className="muted">{t('registerPlaceholder')}</p>
        </section>
      </div>
    </div>
  );
}
