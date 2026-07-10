import type { MarketPack } from '@german-smart-apply/shared';
import { marketDe } from '@german-smart-apply/market-de';
import { AnthropicAiProvider } from './anthropic-provider.js';
import { MockAiProvider } from './mock-provider.js';
import type { AiProvider } from './types.js';

export * from './types.js';
export { MockAiProvider } from './mock-provider.js';
export {
  AnthropicAiProvider,
  AiProviderError,
  type AiProviderErrorCode,
  type AnthropicMessagesClient,
  type AnthropicAiProviderOptions,
} from './anthropic-provider.js';

/**
 * Factory used by API/worker callers. Returns a real AnthropicAiProvider when
 * ANTHROPIC_API_KEY is set in the environment, and falls back to the
 * deterministic MockAiProvider otherwise (e.g. local dev/sandboxes without a
 * key, or tests that want shape assertions without network calls).
 *
 * `marketPack` defaults to Germany (the only active market pack today) but
 * is accepted as a parameter so this factory - and AnthropicAiProvider itself
 * - is never hardcoded to one country as more market packs come online.
 */
export function createAiProvider(marketPack: MarketPack = marketDe): AiProvider {
  if (process.env.ANTHROPIC_API_KEY) {
    return new AnthropicAiProvider(marketPack);
  }
  return new MockAiProvider();
}
