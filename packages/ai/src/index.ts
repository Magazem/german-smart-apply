import type { MarketPack } from '@german-smart-apply/shared';
import { marketDe } from '@german-smart-apply/market-de';
import { AnthropicAiProvider } from './anthropic-provider.js';
import { OpenRouterAiProvider } from './openrouter-provider.js';
import { MockAiProvider } from './mock-provider.js';
import type { AiProvider } from './types.js';

export * from './types.js';
export { MockAiProvider } from './mock-provider.js';
export { AiProviderError, type AiProviderErrorCode } from './errors.js';
export { AnthropicAiProvider, type AnthropicMessagesClient, type AnthropicAiProviderOptions } from './anthropic-provider.js';
export { OpenRouterAiProvider, type OpenRouterChatClient, type OpenRouterAiProviderOptions } from './openrouter-provider.js';

/**
 * Factory used by API/worker callers. Priority order:
 *   1. OpenRouterAiProvider, if OPENROUTER_API_KEY is set - a cheap way to
 *      validate real-model behavior (incl. several free models) before
 *      committing to Anthropic's paid API. Model defaults to a free tier
 *      slug, overridable via OPENROUTER_MODEL.
 *   2. AnthropicAiProvider, if ANTHROPIC_API_KEY is set - the production
 *      choice once you're ready to commit.
 *   3. MockAiProvider otherwise (e.g. local dev/sandboxes without any key,
 *      or tests that want shape assertions without network calls).
 * Logs which provider+model was selected so a deployed instance is never a
 * silent mystery about which one is actually serving requests.
 *
 * `marketPack` defaults to Germany (the only active market pack today) but
 * is accepted as a parameter so this factory - and every provider it can
 * return - is never hardcoded to one country as more market packs come online.
 */
export function createAiProvider(marketPack: MarketPack = marketDe): AiProvider {
  if (process.env.OPENROUTER_API_KEY) {
    const model = process.env.OPENROUTER_MODEL;
    console.log(`[ai] using OpenRouterAiProvider (model=${model || '(default free tier)'})`);
    return new OpenRouterAiProvider(marketPack, { model });
  }
  if (process.env.ANTHROPIC_API_KEY) {
    console.log('[ai] using AnthropicAiProvider');
    return new AnthropicAiProvider(marketPack);
  }
  console.log('[ai] using MockAiProvider (no OPENROUTER_API_KEY or ANTHROPIC_API_KEY set)');
  return new MockAiProvider();
}
