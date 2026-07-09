import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { RequestWithUser } from '../../auth/guards/jwt-auth.guard.js';

/**
 * Gates a route to users with an active Pro subscription. Must run after
 * JwtAuthGuard (relies on req.user already being populated) - apply both,
 * JwtAuthGuard first: `@UseGuards(JwtAuthGuard, ProTierGuard)`.
 */
@Injectable()
export class ProTierGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = await this.prisma.client.user.findUniqueOrThrow({
      where: { id: request.user.id },
      select: { subscriptionStatus: true },
    });
    if (user.subscriptionStatus !== 'pro') {
      throw new ForbiddenException('This feature requires a Pro subscription');
    }
    return true;
  }
}
