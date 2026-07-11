import { describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { AdminGuard } from './admin.guard.js';

function buildContext(userId: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: { id: userId, email: 'x@example.com' } }),
    }),
  } as unknown as ExecutionContext;
}

describe('AdminGuard', () => {
  it('allows a user with the admin role', async () => {
    const prisma = {
      client: { user: { findUniqueOrThrow: vi.fn().mockResolvedValue({ role: 'admin' }) } },
    };
    const guard = new AdminGuard(prisma as never);
    await expect(guard.canActivate(buildContext('user-1'))).resolves.toBe(true);
  });

  it('rejects a regular user with ForbiddenException', async () => {
    const prisma = {
      client: { user: { findUniqueOrThrow: vi.fn().mockResolvedValue({ role: 'user' }) } },
    };
    const guard = new AdminGuard(prisma as never);
    await expect(guard.canActivate(buildContext('user-1'))).rejects.toThrow(ForbiddenException);
  });
});
