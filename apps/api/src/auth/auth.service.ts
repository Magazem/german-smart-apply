import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { LoginDto } from './dto/login.dto.js';
import type { JwtPayload } from './jwt-payload.js';

const SALT_ROUNDS = 10;

export interface AuthResult {
  accessToken: string;
  user: { id: string; email: string };
}

// TODO: swap for Clerk/NextAuth when API keys are available. This service is
// a dev-mode stand-in: local email+password with bcrypt hashing and
// self-issued JWTs, isolated behind this one seam so callers (the
// controller) never need to change when the real provider lands.
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.prisma.client.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email: dto.email, passwordHash },
      });
      await tx.consentRecord.createMany({
        data: [
          { userId: created.id, consentType: 'terms', policyVersion: dto.acceptedPolicyVersion },
          { userId: created.id, consentType: 'privacy', policyVersion: dto.acceptedPolicyVersion },
        ],
      });
      return created;
    });

    return this.buildAuthResult(user.id, user.email);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.client.user.findUnique({
      where: { email: dto.email },
    });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.buildAuthResult(user.id, user.email);
  }

  async me(userId: string) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        subscriptionStatus: true,
        role: true,
        createdAt: true,
        candidateProfile: true,
      },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return user;
  }

  private async buildAuthResult(userId: string, email: string): Promise<AuthResult> {
    const payload: JwtPayload = { sub: userId, email };
    const accessToken = await this.jwtService.signAsync(payload);
    return { accessToken, user: { id: userId, email } };
  }
}
