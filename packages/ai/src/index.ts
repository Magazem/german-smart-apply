import { MockAiProvider } from './mock-provider.js';
import type { AiProvider } from './types.js';

export * from './types.js';
export { MockAiProvider } from './mock-provider.js';

// TODO(AI services agent): implement AnthropicAiProvider (src/anthropic-provider.ts)
// backed by @anthropic-ai/sdk, routing tasks through MODEL_ROUTING/TASK_MODEL_TIER,
// and recording tokensUsed from the API response. Wire it in below behind
// ANTHROPIC_API_KEY. Until then this factory always returns the mock so every
// caller (API, workers, frontend) can integrate against the real interface today.
export function createAiProvider(): AiProvider {
  return new MockAiProvider();
}
