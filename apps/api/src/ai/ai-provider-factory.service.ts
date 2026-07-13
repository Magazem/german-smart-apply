import { Injectable } from '@nestjs/common';
import { createAiProvider, type AiProvider } from '@german-smart-apply/ai';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Single source of truth for the admin-editable OpenRouter model override -
 * read fresh from the DB on every getProvider() call (not cached), same
 * "read fresh, don't bake into a long-lived object" reasoning as
 * AdminGuard's per-request role lookup. This is what makes the override take
 * effect immediately for every request without a redeploy: the four
 * *.service.ts callers that generate AI content used to do
 * `private readonly aiProvider = createAiProvider();` once at app startup
 * (Nest services are singletons) and keep that one instance - and its
 * baked-in model - for the process's entire lifetime. Resolving a fresh
 * provider per call here instead fixes that.
 *
 * Ignored entirely when OPENROUTER_API_KEY isn't set - Anthropic/mock don't
 * take a model override, see createAiProvider() in packages/ai.
 */
const OPENROUTER_MODEL_SETTING_KEY = 'openrouter_model_override';

@Injectable()
export class AiProviderFactory {
  constructor(private readonly prisma: PrismaService) {}

  async getModelOverride(): Promise<string | null> {
    const setting = await this.prisma.client.appSetting.findUnique({
      where: { key: OPENROUTER_MODEL_SETTING_KEY },
    });
    return setting?.value ?? null;
  }

  /** Pass null/undefined/empty-string to clear the override and fall back to OPENROUTER_MODEL / the default. */
  async setModelOverride(model: string | null | undefined): Promise<string | null> {
    const trimmed = model?.trim() || null;
    if (!trimmed) {
      await this.prisma.client.appSetting.deleteMany({ where: { key: OPENROUTER_MODEL_SETTING_KEY } });
      return null;
    }
    await this.prisma.client.appSetting.upsert({
      where: { key: OPENROUTER_MODEL_SETTING_KEY },
      create: { key: OPENROUTER_MODEL_SETTING_KEY, value: trimmed },
      update: { value: trimmed },
    });
    return trimmed;
  }

  async getProvider(): Promise<AiProvider> {
    const override = await this.getModelOverride();
    return createAiProvider(undefined, { openRouterModel: override ?? undefined });
  }
}
