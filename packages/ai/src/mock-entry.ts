// Browser-safe entry point: exports only the deterministic mock provider and
// shared types, never touching anthropic-provider.ts (which pulls in
// @anthropic-ai/sdk's Node built-ins - node:path etc. - and breaks when
// bundled for a browser target). Consumers that render client-side (e.g.
// apps/web's mock API client) must import from here, not from '.', so the
// Anthropic SDK never enters their bundle.
export * from './types.js';
export { MockAiProvider } from './mock-provider.js';
