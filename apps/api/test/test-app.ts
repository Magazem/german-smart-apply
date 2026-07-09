import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
}

/**
 * Boots the full Nest module graph against the real local Postgres instance
 * (per the task: "a test schema or the same DB with cleanup ... your call").
 * Each e2e spec is responsible for tagging the rows it creates (unique
 * emails/names) and deleting them in afterAll so specs don't leave orphaned
 * data for other suites.
 */
export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ rawBody: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );
  await app.init();
  const prisma = app.get(PrismaService);
  return { app, prisma };
}
