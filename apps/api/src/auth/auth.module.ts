import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { OptionalJwtAuthGuard } from './guards/optional-jwt-auth.guard.js';

// TODO: swap for Clerk/NextAuth when API keys are available. Until then this
// signs/verifies the dev-mode local email+password JWTs. Falls back to a
// hardcoded secret for local/test convenience, but fails closed in
// production - a hardcoded, source-visible signing secret in prod would let
// anyone forge a token for any user.
export function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'JWT_SECRET must be set in production - refusing to start with the hardcoded dev-only fallback secret.',
    );
  }
  return 'dev-only-insecure-secret-change-me';
}

@Module({
  imports: [
    JwtModule.register({
      secret: resolveJwtSecret(),
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, OptionalJwtAuthGuard],
  exports: [JwtAuthGuard, OptionalJwtAuthGuard, JwtModule],
})
export class AuthModule {}
