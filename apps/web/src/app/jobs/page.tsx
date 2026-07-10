'use client';

import { useEffect, useState } from 'react';
import type { CanonicalJob, JobMatchScore, JobSearchFilters, RemoteType, Seniority } from '@german-smart-apply/shared';
import { getApiClient } from '@/lib/api-client';
import { useRequireAuth } from '@/lib/use-require-auth';
import { JobCard } from '@/components/job-card';

const REMOTE_OPTIONS: RemoteType[] = ['onsite', 'hybrid', 'remote'];
const SENIORITY_OPTIONS: Seniority[] = ['intern', 'junior', 'mid', 'senior', 'lead', 'principal'];

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
    salaryMin: f.salaryMin ? Number(f.salaryMin) : undefined,
    locationCountryCode: 'DE',
    limit: 50,
  };
}

export default function JobsPage() {
  const { loading: authLoading } = useRequireAuth();
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [jobs, setJobs] = useState<CanonicalJob[]>([]);
  const [matches, setMatches] = useState<Record<string, JobMatchScore>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(async () => {
      const result = await getApiClient().jobs.search(toApiFilters(filters));
      if (cancelled) return;
      setJobs(result.jobs);
      setMatches(result.matches);
      setTotal(result.total);
      setLoading(false);
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

  return (
    <div className="container" style={{ padding: '40px 24px 96px' }}>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: 24 }}>Job search</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '260px minmax(0, 1fr)', gap: 24, alignItems: 'flex-start' }}>
        <aside className="card stack gap-16" style={{ padding: 20, position: 'sticky', top: 84 }}>
          <div className="field">
            <label htmlFor="query">Search</label>
            <input
              id="query"
              className="input"
              placeholder="Title, company, or stack"
              value={filters.query}
              onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
              data-testid="filter-query"
            />
          </div>

          <div className="field">
            <label htmlFor="title">Title contains</label>
            <input
              id="title"
              className="input"
              placeholder="e.g. Backend"
              value={filters.title}
              onChange={(e) => setFilters((f) => ({ ...f, title: e.target.value }))}
              data-testid="filter-title"
            />
          </div>

          <div className="field">
            <label htmlFor="stack">Tech stack (comma-separated)</label>
            <input
              id="stack"
              className="input"
              placeholder="e.g. React, TypeScript"
              value={filters.stack}
              onChange={(e) => setFilters((f) => ({ ...f, stack: e.target.value }))}
              data-testid="filter-stack"
            />
          </div>

          <div className="field">
            <label>Remote type</label>
            <div className="stack gap-8">
              {REMOTE_OPTIONS.map((type) => (
                <label key={type} className="row gap-8" style={{ fontSize: '0.88rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={filters.remoteType.includes(type)}
                    onChange={() => toggleRemote(type)}
                    data-testid={`filter-remote-${type}`}
                  />
                  {type[0].toUpperCase() + type.slice(1)}
                </label>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Seniority</label>
            <div className="stack gap-8">
              {SENIORITY_OPTIONS.map((s) => (
                <label key={s} className="row gap-8" style={{ fontSize: '0.88rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={filters.seniority.includes(s)}
                    onChange={() => toggleSeniority(s)}
                    data-testid={`filter-seniority-${s}`}
                  />
                  {s[0].toUpperCase() + s.slice(1)}
                </label>
              ))}
            </div>
          </div>

          <div className="field">
            <label htmlFor="language">Language</label>
            <select
              id="language"
              className="select"
              value={filters.language}
              onChange={(e) => setFilters((f) => ({ ...f, language: e.target.value }))}
              data-testid="filter-language"
            >
              <option value="">Any</option>
              <option value="en">English</option>
              <option value="de">Deutsch</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="salaryMin">Minimum salary (EUR)</label>
            <input
              id="salaryMin"
              type="number"
              className="input"
              placeholder="e.g. 60000"
              value={filters.salaryMin}
              onChange={(e) => setFilters((f) => ({ ...f, salaryMin: e.target.value }))}
              data-testid="filter-salary-min"
            />
          </div>

          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFilters(EMPTY_FILTERS)}>
            Clear filters
          </button>
        </aside>

        <div className="stack gap-16">
          <p className="muted" data-testid="jobs-result-count">
            {loading ? 'Searching…' : `${total} job${total === 1 ? '' : 's'} found`}
          </p>
          {loading ? (
            <div className="stack gap-12">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton" style={{ height: 160 }} />
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <div className="card" style={{ padding: 32, textAlign: 'center' }}>
              <p className="muted">No jobs match these filters. Try loosening them.</p>
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
