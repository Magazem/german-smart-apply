import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { JwtPayload } from '../jwt-payload.js';
import type { RequestWithUser } from './jwt-auth.guard.js';

/**
 * Same JWT verification as JwtAuthGuard, but never rejects the request.
 * Used on routes that must stay browsable by anonymous visitors (job
 * search/detail, per plan.md's "prove value in under 5 minutes" free
 * experience) while still personalizing ranking when a valid token is
 * present.
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const header = request.headers.authorization;
    if (header) {
      const [type, token] = header.split(' ');
      if (type === 'Bearer' && token) {
        try {
          const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
          request.user = { id: payload.sub, email: payload.email };
        } catch {
          // Invalid/expired token on an optional-auth route: proceed anonymously.
        }
      }
    }
    return true;
  }
}
