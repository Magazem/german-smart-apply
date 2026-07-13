'use client';

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

const LOCALE_LABELS: Record<string, string> = {
  en: 'EN',
  de: 'DE',
};

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="row gap-4" role="group" aria-label="Language">
      {routing.locales.map((loc) => (
        <button
          key={loc}
          type="button"
          className={`btn btn-sm ${loc === locale ? 'btn-secondary' : 'btn-ghost'}`}
          onClick={() => router.replace(pathname, { locale: loc })}
          disabled={loc === locale}
          data-testid={`language-switch-${loc}`}
        >
          {LOCALE_LABELS[loc] ?? loc.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
