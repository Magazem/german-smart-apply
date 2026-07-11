import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { RequestWithUser } from '../../auth/guards/jwt-auth.guard.js';

/**
 * Gates a route to users with the 'admin' role. Must run after JwtAuthGuard
 * (relies on req.user already being populated) - apply both, JwtAuthGuard
 * first: `@UseGuards(JwtAuthGuard, AdminGuard)`.
 *
 * Same fresh-lookup-per-request pattern as ProTierGuard: role isn't carried
 * in the JWT, so a promotion/demotion (manual DB update - there's no
 * self-serve path to become admin) takes effect on the next request rather
 * than requiring the user to log out and back in.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = await this.prisma.client.user.findUniqueOrThrow({
      where: { id: request.user.id },
      select: { role: true },
    });
    if (user.role !== 'admin') {
      throw new ForbiddenException('This area requires an admin account');
    }
    return true;
  }
}
