import { Injectable, Logger } from '@nestjs/common';
import type { CanonicalJob } from '@german-smart-apply/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { JobsService } from '../jobs/jobs.service.js';
import type { SearchJobsDto } from '../jobs/dto/search-jobs.dto.js';
import { createEmailProvider, type EmailProvider } from './email-provider.js';

export interface AlertRunSummary {
  searchesChecked: number;
  emailsSent: number;
  totalJobsMatched: number;
}

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);
  private readonly emailProvider: EmailProvider = createEmailProvider();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobsService: JobsService,
  ) {}

  /**
   * Checks every active saved search for jobs that entered canonical_jobs
   * since that search's last delivery (or since the search was created, if
   * it's never fired), emails the owner when there's something new, and
   * records an AlertDelivery row either way the matching completed - so the
   * next run's "since" cursor always advances, even on a zero-match check.
   *
   * Manually-invokable only (POST /admin/alerts/run) - there is no standing
   * scheduler. Wiring a real cron trigger is a deployment-level decision
   * (Fly scheduled machine, external cron, etc.), same as the crawler
   * pipeline in DEPLOYMENT.md's "Workers" section.
   */
  async runAll(): Promise<AlertRunSummary> {
    const activeSearches = await this.prisma.client.savedSearch.findMany({
      where: { isActive: true },
      include: {
        user: { select: { email: true } },
        deliveries: { orderBy: { sentAt: 'desc' }, take: 1 },
      },
    });

    let emailsSent = 0;
    let totalJobsMatched = 0;

    for (const search of activeSearches) {
      const since = search.deliveries[0]?.sentAt ?? search.createdAt;
      const filters = search.filters as SearchJobsDto;

      let matches: CanonicalJob[];
      try {
        matches = await this.jobsService.findNewMatches(filters, since);
      } catch (err) {
        // One saved search with malformed/legacy filters shouldn't stop the
        // rest of the run from delivering.
        this.logger.error(`Skipping saved search ${search.id} (bad filters?): ${String(err)}`);
        continue;
      }

      if (matches.length === 0) continue;

      await this.emailProvider.send({
        to: search.user.email,
        subject: `${matches.length} new job${matches.length === 1 ? '' : 's'} for "${search.name}"`,
        text: this.buildEmailBody(search.name, matches),
      });

      await this.prisma.client.alertDelivery.create({
        data: {
          savedSearchId: search.id,
          jobIds: matches.map((job) => job.jobId),
          channel: 'email',
        },
      });

      emailsSent += 1;
      totalJobsMatched += matches.length;
    }

    return { searchesChecked: activeSearches.length, emailsSent, totalJobsMatched };
  }

  private buildEmailBody(searchName: string, jobs: CanonicalJob[]): string {
    const lines = jobs.map((job) => `- ${job.jobTitleRaw} at ${job.companyNameRaw} — ${job.applyUrl}`);
    return [`New matches for your saved search "${searchName}":`, '', ...lines].join('\n');
  }
}
