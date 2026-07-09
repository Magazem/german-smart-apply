import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { getPrismaClient, PrismaClient } from '@german-smart-apply/db';

/**
 * Thin Nest wrapper around the shared @german-smart-apply/db singleton so the
 * rest of the app can inject `PrismaService` like any other provider while
 * still sharing one PrismaClient instance (and one connection pool) across
 * the API process, matching how workers use the same package.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly client: PrismaClient = getPrismaClient();

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
