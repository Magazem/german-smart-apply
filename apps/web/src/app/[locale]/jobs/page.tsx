'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useEffect, useState } from 'react';
import type { CanonicalJob, JobMatchScore, JobSearchFilters, RemoteType, Seniority } from '@german-smart-apply/shared';
import { getApiClient } from '@/lib/api-client';
import { useRequireAuth } from '@/lib/use-require-auth';
import { JobCard } from '@/components/job-card';

const REMOTE_OPTIONS: RemoteType[] = ['onsite', 'hybrid', 'remote'];
const SENIORITY_OPTIONS: Seniority[] = ['intern', 'junior', 'mid', 'senior', 'lead', 'principal'];

const REMOTE_LABEL_KEYS: Record<RemoteType, string> = {
  onsite: 'remoteOnsite',
  hybrid: 'remoteHybrid',
  remote: 'remoteRemote',
};

const SENIORITY_LABEL_KEYS: Record<Seniority, string> = {
  intern: 'seniorityIntern',
  junior: 'seniorityJunior',
  mid: 'seniorityMid',
  senior: 'senioritySenior',
  lead: 'seniorityLead',
  principal: 'seniorityPrincipal',
};

interface FilterState {
  query: string;
  title: string;
  remoteType: RemoteType[];
  seniority: Seniority[];
  language: string;
  salaryMin: string;
  stack: string;
}

const EMPTY_FILTERS: FilterState = {
  query: '',
  title: '',
  remoteType: [],
  seniority: [],
  language: '',
  salaryMin: '',
  stack: '',
};

function toApiFilters(f: FilterState): JobSearchFilters {
  return {
    query: f.query || undefined,
    title: f.title || undefined,
    stack: f.stack ? f.stack.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    remoteType: f.remoteType.length ? f.remoteType : undefined,
    seniority: f.seniority.length ? f.seniority : undefined,
    language: f.language || undefined,
    // Rounded, not passed through raw: SearchJobsDto.salaryMin is @IsInt(), so
    // a non-integer from the number input (typing "1000.5") was rejected with a
    // 400 by the real API - which, before this page had any error handling,
    // showed as a skeleton that never resolved.
    salaryMin: f.salaryMin ? Math.round(Number(f.salaryMin)) : undefined,
    locationCountryCode: 'DE',
    limit: 50,
  };
}

export default function JobsPage() {
  const t = useTranslations('JobsList');
  const { loading: authLoading } = useRequireAuth();
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [jobs, setJobs] = useState<CanonicalJob[]>([]);
  const [matches, setMatches] = useState<Record<string, JobMatchScore>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  // This page had no error state at all - unlike dashboard/job-detail/
  // applications/cv, which all have one. Against the mock, search() cannot
  // reject, so the omission was invisible.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingSearch, setSavingSearch] = useState(false);
  const [searchName, setSearchName] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(async () => {
      // try/catch/finally, not a bare await: without the finally,
      // setLoading(false) was never reached on rejection, so any 4xx/5xx/network
      // failure left the page showing loading skeletons and "Searching…"
      // permanently, with no error and no way to retry.
      try {
        const result = await getApiClient().jobs.search(toApiFilters(filters));
        if (cancelled) return;
        setLoadError(null);
        setJobs(result.jobs);
        setMatches(result.matches);
        setTotal(result.total);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : t('loadError'));
        setJobs([]);
        setMatches({});
        setTotal(0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [authLoading, filters]);

  const toggleRemote = (type: RemoteType) => {
    setFilters((f) => ({
      ...f,
      remoteType: f.remoteType.includes(type) ? f.remoteType.filter((t) => t !== type) : [...f.remoteType, type],
    }));
  };

  const toggleSeniority = (s: Seniority) => {
    setFilters((f) => ({
      ...f,
      seniority: f.seniority.includes(s) ? f.seniority.filter((t) => t !== s) : [...f.seniority, s],
    }));
  };

  const handleSaveSearch = async () => {
    if (!searchName.trim()) return;
    setSaveStatus('saving');
    try {
      await getApiClient().savedSearches.create(searchName.trim(), toApiFilters(filters));
      setSaveStatus('saved');
      setSearchName('');
      setSavingSearch(false);
    } catch {
      setSaveStatus('error');
    }
  };

  return (
    <div className="container" style={{ padding: '40px 24px 96px' }}>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: 24 }}>{t('title')}</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '260px minmax(0, 1fr)', gap: 24, alignItems: 'flex-start' }}>
        <aside className="card stack gap-16" style={{ padding: 20, position: 'sticky', top: 84 }}>
          <div className="field">
            <label htmlFor="query">{t('searchLabel')}</label>
            <input
              id="query"
              className="input"
              placeholder={t('searchPlaceholder')}
              value={filters.query}
              onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
              data-testid="filter-query"
            />
          </div>

          <div className="field">
            <label htmlFor="title">{t('titleLabel')}</label>
            <input
              id="title"
              className="input"
              placeholder={t('titlePlaceholder')}
              value={filters.title}
              onChange={(e) => setFilters((f) => ({ ...f, title: e.target.value }))}
              data-testid="filter-title"
            />
          </div>

          <div className="field">
            <label htmlFor="stack">{t('stackLabel')}</label>
            <input
              id="stack"
              className="input"
              placeholder={t('stackPlaceholder')}
              value={filters.stack}
              onChange={(e) => setFilters((f) => ({ ...f, stack: e.target.value }))}
              data-testid="filter-stack"
            />
          </div>

          <div className="field">
            <label>{t('remoteTypeLabel')}</label>
            <div className="stack gap-8">
              {REMOTE_OPTIONS.map((type) => (
                <label key={type} className="row gap-8" style={{ fontSize: '0.88rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={filters.remoteType.includes(type)}
                    onChange={() => toggleRemote(type)}
                    data-testid={`filter-remote-${type}`}
                  />
                  {t(REMOTE_LABEL_KEYS[type])}
                </label>
              ))}
            </div>
          </div>

          <div className="field">
            <label>{t('seniorityLabel')}</label>
            <div className="stack gap-8">
              {SENIORITY_OPTIONS.map((s) => (
                <label key={s} className="row gap-8" style={{ fontSize: '0.88rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={filters.seniority.includes(s)}
                    onChange={() => toggleSeniority(s)}
                    data-testid={`filter-seniority-${s}`}
                  />
                  {t(SENIORITY_LABEL_KEYS[s])}
                </label>
              ))}
            </div>
          </div>

          <div className="field">
            <label htmlFor="language">{t('languageLabel')}</label>
            <select
              id="language"
              className="select"
              value={filters.language}
              onChange={(e) => setFilters((f) => ({ ...f, language: e.target.value }))}
              data-testid="filter-language"
            >
              <option value="">{t('languageAny')}</option>
              <option value="en">{t('languageEnglish')}</option>
              <option value="de">{t('languageGerman')}</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="salaryMin">{t('salaryMinLabel')}</label>
            <input
              id="salaryMin"
              type="number"
              className="input"
              placeholder={t('salaryMinPlaceholder')}
              value={filters.salaryMin}
              onChange={(e) => setFilters((f) => ({ ...f, salaryMin: e.target.value }))}
              data-testid="filter-salary-min"
            />
          </div>

          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFilters(EMPTY_FILTERS)}>
            {t('clearFilters')}
          </button>

          <div className="stack gap-8" style={{ borderTop: '1px solid var(--color-border)', paddingTop: 16 }}>
            {!savingSearch && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setSavingSearch(true);
                  setSaveStatus('idle');
                }}
                data-testid="save-search-open"
              >
                {t('saveSearch')}
              </button>
            )}
            {savingSearch && (
              <div className="stack gap-8">
                <input
                  className="input"
                  placeholder={t('saveSearchNamePlaceholder')}
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  data-testid="save-search-name"
                  autoFocus
                />
                <div className="row gap-8">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={!searchName.trim() || saveStatus === 'saving'}
                    onClick={handleSaveSearch}
                    data-testid="save-search-confirm"
                  >
                    {saveStatus === 'saving' ? t('saving') : t('save')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setSavingSearch(false);
                      setSearchName('');
                    }}
                  >
                    {t('cancel')}
                  </button>
                </div>
              </div>
            )}
            {saveStatus === 'saved' && (
              <p style={{ fontSize: '0.8rem', color: 'var(--color-success)' }} data-testid="save-search-success">
                {t.rich('saveSearchSuccess', {
                  link: (chunks) => <Link href="/saved-searches">{chunks}</Link>,
                })}
              </p>
            )}
            {saveStatus === 'error' && (
              <p style={{ fontSize: '0.8rem', color: 'var(--color-danger)' }}>{t('saveSearchError')}</p>
            )}
          </div>
        </aside>

        <div className="stack gap-16">
          <p className="muted" data-testid="jobs-result-count">
            {loading ? t('searching') : loadError ? t('loadErrorCount') : t('resultCount', { count: total })}
          </p>
          {loading ? (
            <div className="stack gap-12">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton" style={{ height: 160 }} />
              ))}
            </div>
          ) : loadError ? (
            // Distinct from the no-results card below on purpose: "your filters
            // matched nothing" and "we could not reach the server" are different
            // facts, and showing the first for the second is what made a backend
            // outage look like an empty job market.
            <div className="card" style={{ padding: 32, textAlign: 'center' }} data-testid="jobs-load-error">
              <p>{t('loadError')}</p>
              <p className="muted" style={{ marginTop: 8, fontSize: 14 }}>{loadError}</p>
              <button
                type="button"
                className="btn"
                style={{ marginTop: 16 }}
                onClick={() => setFilters((f) => ({ ...f }))}
              >
                {t('retry')}
              </button>
            </div>
          ) : jobs.length === 0 ? (
            <div className="card" style={{ padding: 32, textAlign: 'center' }}>
              <p className="muted">{t('noResults')}</p>
            </div>
          ) : (
            <div className="stack gap-16" data-testid="jobs-results-list">
              {jobs.map((job) => (
                <JobCard key={job.jobId} job={job} match={matches[job.jobId]} whyMatch={matches[job.jobId]?.explanation} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
