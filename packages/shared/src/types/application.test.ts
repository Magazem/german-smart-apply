import { describe, expect, it } from 'vitest';
import { canTransition } from './application.js';

describe('canTransition', () => {
  it('allows new -> viewed', () => {
    expect(canTransition('new', 'viewed')).toBe(true);
  });

  it('allows draft_ready -> awaiting_approval', () => {
    expect(canTransition('draft_ready', 'awaiting_approval')).toBe(true);
  });

  it('rejects skipping straight from new to applied (approval-first)', () => {
    expect(canTransition('new', 'applied')).toBe(false);
  });

  it('rejects any transition out of archived (terminal state)', () => {
    expect(canTransition('archived', 'new')).toBe(false);
    expect(canTransition('archived', 'applied')).toBe(false);
  });

  it('allows offer and rejected to be archived', () => {
    expect(canTransition('offer', 'archived')).toBe(true);
    expect(canTransition('rejected', 'archived')).toBe(true);
  });
});
