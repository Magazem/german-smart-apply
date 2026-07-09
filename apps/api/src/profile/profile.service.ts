import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { UpdateProfileDto } from './dto/update-profile.dto.js';

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const profile = await this.prisma.client.candidateProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      throw new NotFoundException('No candidate profile yet — PUT /profile to create one');
    }
    return profile;
  }

  async upsertProfile(userId: string, dto: UpdateProfileDto) {
    return this.prisma.client.candidateProfile.upsert({
      where: { userId },
      create: {
        userId,
        targetRole: dto.targetRole,
        targetCountryCode: dto.targetCountryCode,
        preferredLanguage: dto.preferredLanguage,
        seniority: dto.seniority,
        locationPreference: dto.locationPreference,
        fullName: dto.fullName,
        skills: dto.skills ?? [],
        summary: dto.summary,
        salaryTargetMin: dto.salaryTargetMin,
        salaryTargetMax: dto.salaryTargetMax,
        workAuthorization: dto.workAuthorization,
        companyBlacklist: dto.companyBlacklist ?? [],
        commutePreferenceKm: dto.commutePreferenceKm,
        portfolioLinks: dto.portfolioLinks ?? [],
      },
      update: {
        targetRole: dto.targetRole,
        targetCountryCode: dto.targetCountryCode,
        preferredLanguage: dto.preferredLanguage,
        seniority: dto.seniority,
        locationPreference: dto.locationPreference,
        ...(dto.fullName !== undefined && { fullName: dto.fullName }),
        ...(dto.skills !== undefined && { skills: dto.skills }),
        ...(dto.summary !== undefined && { summary: dto.summary }),
        ...(dto.salaryTargetMin !== undefined && { salaryTargetMin: dto.salaryTargetMin }),
        ...(dto.salaryTargetMax !== undefined && { salaryTargetMax: dto.salaryTargetMax }),
        ...(dto.workAuthorization !== undefined && { workAuthorization: dto.workAuthorization }),
        ...(dto.companyBlacklist !== undefined && { companyBlacklist: dto.companyBlacklist }),
        ...(dto.commutePreferenceKm !== undefined && {
          commutePreferenceKm: dto.commutePreferenceKm,
        }),
        ...(dto.portfolioLinks !== undefined && { portfolioLinks: dto.portfolioLinks }),
      },
    });
  }
}
