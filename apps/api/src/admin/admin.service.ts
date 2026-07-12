import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

// How many of a source's most recent runs to look at for a success-rate
// snapshot - recent health, not a lifetime average that a long-fixed
// problem would keep dragging down forever.
const RECENT_RUN_WINDOW = 20;
const RUN_HISTORY_LIMIT = 50;

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

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
