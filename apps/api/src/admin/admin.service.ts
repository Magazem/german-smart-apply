import { Injectable } from '@nestjs/common';
import { APPLICATION_STATUSES, type ApplicationStatus } from '@german-smart-apply/shared';
import { AiProviderFactory } from '../ai/ai-provider-factory.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TokenUsageService } from '../token-usage/token-usage.service.js';

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const SIGNUP_TREND_WINDOW_DAYS = 30;

// How many of a source's most recent runs to look at for a success-rate
// snapshot - recent health, not a lifetime average that a long-fixed
// problem would keep dragging down forever.
const RECENT_RUN_WINDOW = 20;
const RUN_HISTORY_LIMIT = 50;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenUsage: TokenUsageService,
    private readonly aiProviderFactory: AiProviderFactory,
  ) {}

  /**
   * Lets an admin type any OpenRouter model slug (free or paid) and have it
   * take effect immediately for every subsequent AI call, no redeploy - see
   * AiProviderFactory for why that's possible (the model is resolved fresh
   * per request, not baked into a long-lived provider instance). Only takes
   * effect when OPENROUTER_API_KEY is the active provider; Anthropic/mock
   * ignore it entirely.
   */
  async getOpenRouterModelOverride(): Promise<{ model: string | null }> {
    return { model: await this.aiProviderFactory.getModelOverride() };
  }

  async setOpenRouterModelOverride(model: string | null | undefined): Promise<{ model: string | null }> {
    return { model: await this.aiProviderFactory.setModelOverride(model) };
  }

  async listSourcesWithHealth() {
    const sources = await this.prisma.client.source.findMany({ orderBy: { displayName: 'asc' } });
    return Promise.all(sources.map((source) => this.withHealth(source)));
  }

  async runHistory(sourceId: string) {
    const source = await this.prisma.client.source.findUnique({ where: { id: sourceId } });
    if (!source) return null;
    const runs = await this.prisma.client.sourceCrawlRun.findMany({
      where: { sourceId },
      orderBy: { startedAt: 'desc' },
      take: RUN_HISTORY_LIMIT,
    });
    return { source, runs };
  }

  async dedupStats() {
    const [totalRawJobs, totalCanonicalJobs, visibleCanonicalJobs, totalClusters, nearDuplicateClusters, totalClusterMembers] =
      await Promise.all([
        this.prisma.client.rawJob.count(),
        this.prisma.client.canonicalJob.count(),
        this.prisma.client.canonicalJob.count({ where: { isVisible: true } }),
        this.prisma.client.duplicateCluster.count(),
        // near_duplicates.py prefixes its clusterKey with 'near-dup:' -
        // exact-match clusters (dedup.py) key off a bare sha256 hex hash, no
        // prefix - so this string check is the real, already-stored signal
        // that separates the two dedup passes, not a guess.
        this.prisma.client.duplicateCluster.count({ where: { clusterKey: { startsWith: 'near-dup:' } } }),
        this.prisma.client.duplicateClusterMember.count(),
      ]);

    return {
      totalRawJobs,
      totalCanonicalJobs,
      visibleCanonicalJobs,
      hiddenByDuplication: totalCanonicalJobs - visibleCanonicalJobs,
      totalDuplicateClusters: totalClusters,
      exactDuplicateClusters: totalClusters - nearDuplicateClusters,
      nearDuplicateClusters,
      totalDuplicateClusterMembers: totalClusterMembers,
    };
  }

  async analytics() {
    const [subscriptionCounts, applicationCounts, tokenUsage, signupsRecent] = await Promise.all([
      this.prisma.client.user.groupBy({ by: ['subscriptionStatus'], _count: { _all: true } }),
      this.prisma.client.application.groupBy({ by: ['status'], _count: { _all: true } }),
      this.tokenUsage.summaryAllUsers(),
      this.prisma.client.user.count({
        where: { createdAt: { gte: new Date(Date.now() - SIGNUP_TREND_WINDOW_DAYS * MS_PER_DAY) } },
      }),
    ]);

    const userCounts = { total: 0, free: 0, pro: 0, canceled: 0, past_due: 0 };
    for (const row of subscriptionCounts) {
      userCounts.total += row._count._all;
      userCounts[row.subscriptionStatus] = row._count._all;
    }

    // Zero-filled so the UI can render every status, not just the ones with rows.
    const applicationFunnel = Object.fromEntries(
      APPLICATION_STATUSES.map((status) => [status, 0]),
    ) as Record<ApplicationStatus, number>;
    for (const row of applicationCounts) {
      applicationFunnel[row.status] = row._count._all;
    }

    return {
      userCounts,
      applicationFunnel,
      tokenUsage,
      signupsLast30Days: signupsRecent,
    };
  }

  private async withHealth(source: { id: string; [key: string]: unknown }) {
    const recentRuns = await this.prisma.client.sourceCrawlRun.findMany({
      where: { sourceId: source.id },
      orderBy: { startedAt: 'desc' },
      take: RECENT_RUN_WINDOW,
    });
    // A still-running run is neither a success nor a failure yet - exclude
    // it from the denominator rather than let it silently count as one.
    const completedRuns = recentRuns.filter((run) => run.status !== 'running');
    const successCount = completedRuns.filter((run) => run.status === 'success').length;

    return {
      ...source,
      lastRun: recentRuns[0] ?? null,
      recentRunCount: recentRuns.length,
      // null (not 0) when nothing has completed yet - "no data" and "0%
      // success" are different states and the UI renders them differently.
      successRate: completedRuns.length > 0 ? successCount / completedRuns.length : null,
    };
  }
}
