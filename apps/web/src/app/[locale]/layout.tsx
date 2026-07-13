import type { Metadata } from 'next';
import { IBM_Plex_Mono } from 'next/font/google';
import Script from 'next/script';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { AuthProvider } from '@/lib/auth-context';
import { ThemeProvider } from '@/lib/theme-context';
import { Nav } from '@/components/nav';
import { TrustStrip } from '@/components/trust-strip';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import './globals.css';

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-mono',
  display: 'swap',
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: 'Smart Apply — Germany-first AI job search, built on trust',
  description:
    'Trusted, deduplicated German job listings with approval-first applications. No blind auto-apply, ever.',
};

// Applies a persisted theme choice before first paint, so switching to (or reloading into)
// the terminal theme doesn't flash the default light/dark palette first. Kept tiny and
// defensive (try/catch, no dependency on React) since it runs before hydration.
const NO_FLASH_THEME_SCRIPT = `
(function () {
  try {
    var t = window.localStorage.getItem('sa-theme');
    if (t && t !== 'system') document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
})();
`;

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const { locale } = params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const t = await getTranslations('Layout');

  return (
    <html lang={locale} className={mono.variable}>
      <body>
        <Script id="theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
        <NextIntlClientProvider>
          <ThemeProvider>
            <AuthProvider>
              <Nav />
              <TrustStrip />
              <main>{children}</main>
              <footer style={{ borderTop: '1px solid var(--color-border)', marginTop: 64 }}>
                <div
                  className="container row spread"
                  style={{ padding: '24px', fontSize: '0.82rem', flexWrap: 'wrap', gap: 12 }}
                >
                  <span className="muted">{t('tagline')}</span>
                  <span className="row gap-8">
                    <Link href="/terms" className="muted" style={{ textDecoration: 'underline' }}>
                      {t('terms')}
                    </Link>
                    <Link href="/privacy" className="muted" style={{ textDecoration: 'underline' }}>
                      {t('privacy')}
                    </Link>
                    <Link href="/impressum" className="muted" style={{ textDecoration: 'underline' }}>
                      {t('impressum')}
                    </Link>
                  </span>
                  <span className="muted">{t('marketStatus')}</span>
                </div>
              </footer>
            </AuthProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
