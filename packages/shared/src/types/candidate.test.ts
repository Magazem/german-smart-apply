import { describe, expect, it } from 'vitest';
import { TARGET_ROLE_UNSET, hasCompletedOnboarding } from './candidate.js';

describe('hasCompletedOnboarding', () => {
  it('is false for the placeholder the real API writes before the questions step', () => {
    // The bug this guards: the frontend used `!profile.targetRole`, which is only
    // ever true against the mock client (it creates profiles with targetRole:
    // ''). The real API's CV-parse prefill always writes something non-empty, so
    // a user who uploaded a CV and abandoned onboarding was treated as fully
    // onboarded - routed to /dashboard, no "finish onboarding" CTA, and their
    // jobs ranked against the literal string "Not specified yet".
    expect(hasCompletedOnboarding({ targetRole: TARGET_ROLE_UNSET })).toBe(false);
  });

  it('is false for an empty or whitespace-only role', () => {
    expect(hasCompletedOnboarding({ targetRole: '' })).toBe(false);
    expect(hasCompletedOnboarding({ targetRole: '   ' })).toBe(false);
  });

  it('is false for a missing profile', () => {
    expect(hasCompletedOnboarding(null)).toBe(false);
    expect(hasCompletedOnboarding(undefined)).toBe(false);
  });

  it('is true once the user has given a real target role', () => {
    expect(hasCompletedOnboarding({ targetRole: 'Backend Engineer' })).toBe(true);
  });

  it('narrows the profile type, so callers can use it directly afterwards', () => {
    const profile: { targetRole: string; targetCountryCode: string } | null = {
      targetRole: 'Backend Engineer',
      targetCountryCode: 'DE',
    };
    if (hasCompletedOnboarding(profile)) {
      // Compiles only because the predicate narrows away null - this is the
      // assertion, the runtime expect below just keeps the test meaningful.
      expect(profile.targetCountryCode).toBe('DE');
    } else {
      throw new Error('expected a completed profile');
    }
  });
});
