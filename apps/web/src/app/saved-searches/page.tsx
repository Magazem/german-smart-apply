'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { JobSearchFilters } from '@german-smart-apply/shared';
import { useRequireAuth } from '@/lib/use-require-auth';
import { getApiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import type { SavedSearch } from '@/lib/api/types';

function summarizeFilters(filters: JobSearchFilters): string {
  const parts: string[] = [];
  if (filters.query) parts.push(`"${filters.query}"`);
  if (filters.title) parts.push(`title contains "${filters.title}"`);
  if (filters.stack?.length) parts.push(`stack: ${filters.stack.join(', ')}`);
  if (filters.remoteType?.length) parts.push(filters.remoteType.join('/'));
  if (filters.seniority?.length) parts.push(filters.seniority.join('/'));
  if (filters.language) parts.push(filters.language === 'de' ? 'Deutsch' : 'English');
  if (filters.salaryMin) parts.push(`≥ €${filters.salaryMin.toLocaleString()}`);
  return parts.length > 0 ? parts.join(' · ') : 'Any job in Germany';
}

export default function SavedSearchesPage() {
  const { loading: authLoading } = useRequireAuth();
  const [searches, setSearches] = useState<SavedSearch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = async () => {
    try {
      const result = await getApiClient().savedSearches.list();
      setSearches(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load saved searches.');
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
      setError(err instanceof Error ? err.message : 'Could not update this saved search.');
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
      setError(err instanceof Error ? err.message : 'Could not delete this saved search.');
    } finally {
      setPendingId(null);
    }
  };

  if (authLoading) {
    return (
      <div className="container" style={{ padding: '48px 24px' }}>
        <p className="muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="container stack gap-24" style={{ padding: '40px 24px 96px' }}>
      <div className="stack gap-4">
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>Saved searches</h1>
        <p className="muted">
          Get notified by email when new jobs match. Save a search from the{' '}
          <Link href="/jobs">job search page</Link> — apply your filters there, then click “Save this search”.
        </p>
      </div>

      {error && (
        <div className="card" style={{ padding: 16, background: 'var(--color-danger-bg)', border: 'none' }}>
          <p style={{ fontSize: '0.88rem' }}>{error}</p>
        </div>
      )}

      {!searches && !error && <p className="muted">Loading…</p>}

      {searches && searches.length === 0 && (
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          <p className="muted">
            No saved searches yet. Head to <Link href="/jobs">job search</Link>, set up filters you care about, and
            save them to get email alerts on new matches.
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
                    {search.isActive ? 'Active' : 'Paused'}
                  </span>
                </div>
                <span className="muted" style={{ fontSize: '0.82rem' }}>{summarizeFilters(search.filters)}</span>
                <span className="muted" style={{ fontSize: '0.75rem' }}>Saved {formatDate(search.createdAt)}</span>
              </div>

              <div className="row gap-8">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={pendingId === search.id}
                  onClick={() => toggleActive(search)}
                  data-testid={`saved-search-toggle-${search.id}`}
                >
                  {search.isActive ? 'Pause alerts' : 'Resume alerts'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={pendingId === search.id}
                  onClick={() => remove(search)}
                  data-testid={`saved-search-delete-${search.id}`}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
