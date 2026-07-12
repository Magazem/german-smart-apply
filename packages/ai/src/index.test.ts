import { afterEach, describe, expect, it } from 'vitest';
import { marketDe } from '@german-smart-apply/market-de';
import { AnthropicAiProvider } from './anthropic-provider.js';
import { OpenRouterAiProvider } from './openrouter-provider.js';
import { createAiProvider } from './index.js';
import { MockAiProvider } from './mock-provider.js';

describe('createAiProvider', () => {
  const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
  const originalOpenRouterKey = process.env.OPENROUTER_API_KEY;
  const originalOpenRouterModel = process.env.OPENROUTER_MODEL;

  afterEach(() => {
    for (const [envVar, original] of [
      ['ANTHROPIC_API_KEY', originalAnthropicKey],
      ['OPENROUTER_API_KEY', originalOpenRouterKey],
      ['OPENROUTER_MODEL', originalOpenRouterModel],
    ] as const) {
      if (original === undefined) {
        delete process.env[envVar];
      } else {
        process.env[envVar] = original;
      }
    }
  });

  it('falls back to MockAiProvider when no key is set (this sandbox has none)', () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    expect(createAiProvider()).toBeInstanceOf(MockAiProvider);
  });

  it('falls back to MockAiProvider when ANTHROPIC_API_KEY is set but empty', () => {
    delete process.env.OPENROUTER_API_KEY;
    process.env.ANTHROPIC_API_KEY = '';
    expect(createAiProvider()).toBeInstanceOf(MockAiProvider);
  });

  it('returns a real AnthropicAiProvider once ANTHROPIC_API_KEY is present', () => {
    delete process.env.OPENROUTER_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key-not-real';
    expect(createAiProvider()).toBeInstanceOf(AnthropicAiProvider);
  });

  it('returns OpenRouterAiProvider once OPENROUTER_API_KEY is present', () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.OPENROUTER_API_KEY = 'sk-or-test-key-not-real';
    expect(createAiProvider()).toBeInstanceOf(OpenRouterAiProvider);
  });

  it('prefers OpenRouterAiProvider over AnthropicAiProvider when both keys are set', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key-not-real';
    process.env.OPENROUTER_API_KEY = 'sk-or-test-key-not-real';
    expect(createAiProvider()).toBeInstanceOf(OpenRouterAiProvider);
  });

  it('defaults to the Germany market pack but accepts an override for future market packs', () => {
    delete process.env.OPENROUTER_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key-not-real';
    const overridePack = { ...marketDe, countryCode: 'FR', displayName: 'France (test override)' };
    const provider = createAiProvider(overridePack);
    expect(provider).toBeInstanceOf(AnthropicAiProvider);
  });
});
