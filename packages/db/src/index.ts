import { PrismaClient } from '@prisma/client';

let prismaSingleton: PrismaClient | undefined;

export function getPrismaClient(): PrismaClient {
  if (!prismaSingleton) {
    prismaSingleton = new PrismaClient();
  }
  return prismaSingleton;
}

export { PrismaClient } from '@prisma/client';
export * from '@prisma/client';
