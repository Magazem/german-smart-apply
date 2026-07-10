import { afterEach, describe, expect, it } from 'vitest';
import { resolveJwtSecret } from './auth.module.js';

function clearEnv() {
  delete process.env.JWT_SECRET;
  delete process.env.NODE_ENV;
}

describe('resolveJwtSecret', () => {
  afterEach(clearEnv);

  it('returns the dev-only fallback outside production when JWT_SECRET is unset', () => {
    clearEnv();
    expect(resolveJwtSecret()).toBe('dev-only-insecure-secret-change-me');
  });

  it('returns JWT_SECRET when set, regardless of NODE_ENV', () => {
    process.env.JWT_SECRET = 'a-real-secret';
    expect(resolveJwtSecret()).toBe('a-real-secret');
  });

  it('refuses to start with the hardcoded fallback in production (fails closed)', () => {
    clearEnv();
    process.env.NODE_ENV = 'production';
    expect(() => resolveJwtSecret()).toThrow(/JWT_SECRET must be set in production/);
  });

  it('uses the real secret in production when JWT_SECRET is set', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a-real-production-secret';
    expect(resolveJwtSecret()).toBe('a-real-production-secret');
  });
});
