import { describe, expect, it } from 'vitest';
import { marketFr } from './index.js';

describe('marketFr placeholder pack', () => {
  it('is marked planned, not active', () => {
    expect(marketFr.countryCode).toBe('FR');
    expect(marketFr.status).toBe('planned');
  });

  it('declares no sources yet (Phase 3 backlog)', () => {
    expect(marketFr.sources).toHaveLength(0);
  });
});
