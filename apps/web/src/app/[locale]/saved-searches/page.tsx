'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';
import type { JobSearchFilters } from '@german-smart-apply/shared';
import { useRequireAuth } from '@/lib/use-require-auth';
import { getApiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import type { SavedSearch } from '@/lib/api/types';

function summarizeFilters(filters: JobSearchFilters, t: ReturnType<typeof useTranslations>): string {
  const parts: string[] = [];
  if (filters.query) parts.push(`"${filters.query}"`);
  if (filters.title) parts.push(t('filterTitleContains', { title: filters.title }));
  if (filters.stack?.length) parts.push(t('filterStack', { stack: filters.stack.join(', ') }));
  if (filters.remoteType?.length) parts.push(filters.remoteType.join('/'));
  if (filters.seniority?.length) parts.push(filters.seniority.join('/'));
  if (filters.language) parts.push(filters.language === 'de' ? t('languageGerman') : t('languageEnglish'));
  if (filters.salaryMin) parts.push(`≥ €${filters.salaryMin.toLocaleString()}`);
  return parts.length > 0 ? parts.join(' · ') : t('anyJobInGermany');
}

export default function SavedSearchesPage() {
  const t = useTranslations('SavedSearches');
  const { loading: authLoading } = useRequireAuth();
  const [searches, setSearches] = useState<SavedSearch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = async () => {
    try {
      const result = await getApiClient().savedSearches.list();
      setSearches(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('loadError'));
    }
  };

  useEffect(() => {
    if (authLoading) return;
    void load();
  }, [authLoading]);

  const toggleActive = async (search: SavedSearch) => {
    setPendingId(search.id);
    setError(null);
    try {
      await getApiClient().savedSearches.update(search.id, { isActive: !search.isActive });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('toggleActiveError'));
    } finally {
      setPendingId(null);
    }
  };

  const remove = async (search: SavedSearch) => {
    setPendingId(search.id);
    setError(null);
    try {
      await getApiClient().savedSearches.remove(search.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('deleteError'));
    } finally {
      setPendingId(null);
    }
  };

  if (authLoading) {
    return (
      <div className="container" style={{ padding: '48px 24px' }}>
        <p className="muted">{t('loading')}</p>
      </div>
    );
  }

  return (
    <div className="container stack gap-24" style={{ padding: '40px 24px 96px' }}>
      <div className="stack gap-4">
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>{t('pageTitle')}</h1>
        <p className="muted">
          {t('pageSubtitlePrefix')} <Link href="/jobs">{t('jobSearchPageLink')}</Link> {t('pageSubtitleSuffix')}
        </p>
      </div>

      {error && (
        <div className="card" style={{ padding: 16, background: 'var(--color-danger-bg)', border: 'none' }}>
          <p style={{ fontSize: '0.88rem' }}>{error}</p>
        </div>
      )}

      {!searches && !error && <p className="muted">{t('loading')}</p>}

      {searches && searches.length === 0 && (
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          <p className="muted">
            {t('emptyStatePrefix')} <Link href="/jobs">{t('jobSearchLink')}</Link> {t('emptyStateSuffix')}
          </p>
        </div>
      )}

      {searches && searches.length > 0 && (
        <div className="stack gap-12">
          {searches.map((search) => (
            <div
              key={search.id}
              className="card row spread"
              style={{ padding: 20, flexWrap: 'wrap', gap: 12, alignItems: 'center' }}
              data-testid={`saved-search-${search.id}`}
            >
              <div className="stack gap-4">
                <div className="row gap-8" style={{ alignItems: 'center' }}>
                  <strong style={{ fontSize: '1rem' }}>{search.name}</strong>
                  <span className={search.isActive ? 'badge badge-success' : 'badge badge-neutral'}>
                    {search.isActive ? t('statusActive') : t('statusPaused')}
                  </span>
                </div>
                <span className="muted" style={{ fontSize: '0.82rem' }}>{summarizeFilters(search.filters, t)}</span>
                <span className="muted" style={{ fontSize: '0.75rem' }}>{t('savedDateLabel', { date: formatDate(search.createdAt) })}</span>
              </div>

              <div className="row gap-8">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={pendingId === search.id}
                  onClick={() => toggleActive(search)}
                  data-testid={`saved-search-toggle-${search.id}`}
                >
                  {search.isActive ? t('pauseAlerts') : t('resumeAlerts')}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={pendingId === search.id}
                  onClick={() => remove(search)}
                  data-testid={`saved-search-delete-${search.id}`}
                >
                  {t('deleteButton')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
