import { describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { ProTierGuard } from './pro-tier.guard.js';

function buildContext(userId: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: { id: userId, email: 'x@example.com' } }),
    }),
  } as unknown as ExecutionContext;
}

describe('ProTierGuard', () => {
  it('allows a user with an active pro subscription', async () => {
    const prisma = {
      client: { user: { findUniqueOrThrow: vi.fn().mockResolvedValue({ subscriptionStatus: 'pro' }) } },
    };
    const guard = new ProTierGuard(prisma as never);
    await expect(guard.canActivate(buildContext('user-1'))).resolves.toBe(true);
  });

  it('rejects a free-tier user with ForbiddenException', async () => {
    const prisma = {
      client: {
        user: { findUniqueOrThrow: vi.fn().mockResolvedValue({ subscriptionStatus: 'free' }) },
      },
    };
    const guard = new ProTierGuard(prisma as never);
    await expect(guard.canActivate(buildContext('user-1'))).rejects.toThrow(ForbiddenException);
  });

  it('rejects a past_due user (lapsed payment) with ForbiddenException', async () => {
    const prisma = {
      client: {
        user: {
          findUniqueOrThrow: vi.fn().mockResolvedValue({ subscriptionStatus: 'past_due' }),
        },
      },
    };
    const guard = new ProTierGuard(prisma as never);
    await expect(guard.canActivate(buildContext('user-1'))).rejects.toThrow(ForbiddenException);
  });
});
