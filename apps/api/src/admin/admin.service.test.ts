import { describe, expect, it } from 'vitest';
import { isSourceConfigured } from './admin.service.js';

describe('isSourceConfigured', () => {
  it('is false for stepstone with no feedUrls configured (real market-de shape today)', () => {
    expect(isSourceConfigured({ sourceType: 'stepstone', config: {} })).toBe(false);
  });

  it('is false when the list key is present but empty', () => {
    expect(isSourceConfigured({ sourceType: 'stepstone', config: { feedUrls: [] } })).toBe(false);
  });

  it('is true once at least one feed URL is configured', () => {
    expect(
      isSourceConfigured({ sourceType: 'stepstone', config: { feedUrls: ['https://example.com/feed.json'] } }),
    ).toBe(true);
  });

  it.each(['greenhouse', 'lever', 'personio', 'smartrecruiters'])(
    'is false for %s with an empty fetch-target list',
    (sourceType) => {
      expect(isSourceConfigured({ sourceType, config: {} })).toBe(false);
    },
  );

  it('is always true for source types with no known list key (e.g. arbeitsagentur, which has a real default)', () => {
    expect(isSourceConfigured({ sourceType: 'arbeitsagentur', config: {} })).toBe(true);
  });

  it('is true for an unrecognized future source type rather than guessing it is misconfigured', () => {
    expect(isSourceConfigured({ sourceType: 'some-new-adapter', config: {} })).toBe(true);
  });
});
