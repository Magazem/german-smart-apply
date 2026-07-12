import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

// The AI-provider methods actually called from the API today.
// generateCvSuggestions exists on the AiProvider interface but has no
// caller yet (no wired endpoint) - nothing to instrument until it does.
export type TokenUsageFeature =
  | 'parseCv'
  | 'cvVariant'
  | 'coverLetter'
  | 'matchExplanation'
  | 'followUpEmail'
  | 'interviewPrep';

export interface TokenUsageSummary {
  totalTokens: number;
  byFeature: Array<{ feature: string; tokensUsed: number; callCount: number }>;
}

@Injectable()
export class TokenUsageService {
  private readonly logger = new Logger(TokenUsageService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fire-and-forget from the caller's perspective: usage tracking must never
   * be why a CV parse / draft generation / match explanation request fails.
   * Skips genuinely zero-token calls (the MockAiProvider always reports 0)
   * so local dev/test runs don't fill this table with meaningless rows.
   */
  async record(
    userId: string,
    feature: TokenUsageFeature,
    modelUsed: string,
    tokensUsed: number,
  ): Promise<void> {
    if (tokensUsed <= 0) return;
    try {
      await this.prisma.client.tokenUsageEvent.create({
        data: { userId, feature, modelUsed, tokensUsed },
      });
    } catch (err) {
      this.logger.warn(`Failed to record token usage for user ${userId}/${feature}: ${String(err)}`);
    }
  }

  async summaryForUser(userId: string): Promise<TokenUsageSummary> {
    return this.summarize({ userId });
  }

  /** Same shape as summaryForUser, but aggregated across every user - for the admin analytics view. */
  async summaryAllUsers(): Promise<TokenUsageSummary> {
    return this.summarize({});
  }

  private async summarize(where: { userId?: string }): Promise<TokenUsageSummary> {
    const rows = await this.prisma.client.tokenUsageEvent.groupBy({
      by: ['feature'],
      where,
      _sum: { tokensUsed: true },
      _count: { _all: true },
    });
    const byFeature = rows
      .map((r) => ({
        feature: r.feature,
        tokensUsed: r._sum.tokensUsed ?? 0,
        callCount: r._count._all,
      }))
      .sort((a, b) => b.tokensUsed - a.tokensUsed);
    const totalTokens = byFeature.reduce((sum, f) => sum + f.tokensUsed, 0);
    return { totalTokens, byFeature };
  }
}
