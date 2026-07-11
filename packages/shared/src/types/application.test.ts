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

  it('allows regenerating a draft while already draft_ready (a different variant style, a retry, etc.)', () => {
    expect(canTransition('draft_ready', 'draft_ready')).toBe(true);
  });

  it('still rejects draft_ready looping back to an earlier status', () => {
    expect(canTransition('draft_ready', 'viewed')).toBe(false);
    expect(canTransition('draft_ready', 'saved')).toBe(false);
  });
});
