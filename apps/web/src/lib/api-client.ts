import { MockApiClient } from './api/mock-client';
import { RealApiClient } from './api/real-client';
import type { ApiClient } from './api/types';

export * from './api/types';
export { DEMO_EMAIL, DEMO_PASSWORD } from './api/seed';
export { riskLevel, trustLevel } from './api/scoring';

let singleton: ApiClient | null = null;

/**
 * Single factory every page/component should call — never `new
 * MockApiClient()` / `new RealApiClient()` directly. Toggle via
 * NEXT_PUBLIC_USE_MOCK_API: defaults to the mock data layer (what this
 * worktree can actually run and test end to end) since apps/api isn't
 * reachable yet. Set NEXT_PUBLIC_USE_MOCK_API=false once the real API is up,
 * pointing NEXT_PUBLIC_API_URL at it.
 */
export function getApiClient(): ApiClient {
  if (singleton) return singleton;
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK_API !== 'false';
  singleton = useMock
    ? new MockApiClient()
    : new RealApiClient(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001');
  return singleton;
}

export function isMockApi(): boolean {
  return process.env.NEXT_PUBLIC_USE_MOCK_API !== 'false';
}
