import { afterEach, describe, expect, it } from 'vitest';
import { marketDe } from '@german-smart-apply/market-de';
import { AnthropicAiProvider } from './anthropic-provider.js';
import { createAiProvider } from './index.js';
import { MockAiProvider } from './mock-provider.js';

describe('createAiProvider', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalKey;
    }
  });

  it('falls back to MockAiProvider when ANTHROPIC_API_KEY is unset (this sandbox has no key)', () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(createAiProvider()).toBeInstanceOf(MockAiProvider);
  });

  it('falls back to MockAiProvider when ANTHROPIC_API_KEY is set but empty', () => {
    process.env.ANTHROPIC_API_KEY = '';
    expect(createAiProvider()).toBeInstanceOf(MockAiProvider);
  });

  it('returns a real AnthropicAiProvider once ANTHROPIC_API_KEY is present', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key-not-real';
    expect(createAiProvider()).toBeInstanceOf(AnthropicAiProvider);
  });

  it('defaults to the Germany market pack but accepts an override for future market packs', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key-not-real';
    const overridePack = { ...marketDe, countryCode: 'FR', displayName: 'France (test override)' };
    const provider = createAiProvider(overridePack);
    expect(provider).toBeInstanceOf(AnthropicAiProvider);
  });
});
