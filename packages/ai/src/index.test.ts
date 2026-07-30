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
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAllowMock = process.env.ALLOW_MOCK_AI;

  afterEach(() => {
    for (const [envVar, original] of [
      ['ANTHROPIC_API_KEY', originalAnthropicKey],
      ['OPENROUTER_API_KEY', originalOpenRouterKey],
      ['OPENROUTER_MODEL', originalOpenRouterModel],
      ['NODE_ENV', originalNodeEnv],
      ['ALLOW_MOCK_AI', originalAllowMock],
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

  it('refuses to fall back to the mock in production, rather than serving canned text as a cover letter', () => {
    // MockAiProvider's output is persisted as a real ApplicationDraft, is
    // approvable, and exports to PDF, and `modelUsed: 'mock'` is rendered
    // nowhere in the web app - so a deploy that simply forgot to set an API key
    // silently showed template text to users as their tailored application.
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.ALLOW_MOCK_AI;
    process.env.NODE_ENV = 'production';
    expect(() => createAiProvider()).toThrow(/No AI provider configured/);
  });

  it('allows an explicitly opted-in mock in production', () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_MOCK_AI = 'true';
    expect(createAiProvider()).toBeInstanceOf(MockAiProvider);
  });

  it('still falls back to the mock outside production, so local dev needs no keys', () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.ALLOW_MOCK_AI;
    process.env.NODE_ENV = 'development';
    expect(createAiProvider()).toBeInstanceOf(MockAiProvider);
  });

  it('defaults to the Germany market pack but accepts an override for future market packs', () => {
    delete process.env.OPENROUTER_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key-not-real';
    const overridePack = { ...marketDe, countryCode: 'FR', displayName: 'France (test override)' };
    const provider = createAiProvider(overridePack);
    expect(provider).toBeInstanceOf(AnthropicAiProvider);
  });
});
