import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@german-smart-apply/db';
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
        // targetRole/seniority have no DB default (unlike targetCountryCode/
        // preferredLanguage/locationPreference, which the schema itself
        // defaults) - a first partial save (e.g. onboarding's CV-parse step,
        // which only sends fullName/skills/summary) still needs a valid row,
        // matching the same placeholder strategy cv.service.ts's own
        // prefillProfile already uses. The onboarding questions step's later
        // partial save overwrites these with the user's real answers.
        targetRole: dto.targetRole ?? 'Not specified yet',
        targetCountryCode: dto.targetCountryCode,
        preferredLanguage: dto.preferredLanguage,
        seniority: dto.seniority ?? 'mid',
        locationPreference: dto.locationPreference,
        fullName: dto.fullName,
        email: dto.email,
        phone: dto.phone,
        skills: dto.skills ?? [],
        summary: dto.summary,
        experience: (dto.experience ?? []) as unknown as Prisma.InputJsonValue,
        education: (dto.education ?? []) as unknown as Prisma.InputJsonValue,
        languages: dto.languages ?? [],
        salaryTargetMin: dto.salaryTargetMin,
        salaryTargetMax: dto.salaryTargetMax,
        workAuthorization: dto.workAuthorization,
        companyBlacklist: dto.companyBlacklist ?? [],
        homeCity: dto.homeCity,
        acceptableCities: dto.acceptableCities ?? [],
        relocationWillingness: dto.relocationWillingness,
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
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.skills !== undefined && { skills: dto.skills }),
        ...(dto.summary !== undefined && { summary: dto.summary }),
        ...(dto.experience !== undefined && {
          experience: dto.experience as unknown as Prisma.InputJsonValue,
        }),
        ...(dto.education !== undefined && {
          education: dto.education as unknown as Prisma.InputJsonValue,
        }),
        ...(dto.languages !== undefined && { languages: dto.languages }),
        ...(dto.salaryTargetMin !== undefined && { salaryTargetMin: dto.salaryTargetMin }),
        ...(dto.salaryTargetMax !== undefined && { salaryTargetMax: dto.salaryTargetMax }),
        ...(dto.workAuthorization !== undefined && { workAuthorization: dto.workAuthorization }),
        ...(dto.companyBlacklist !== undefined && { companyBlacklist: dto.companyBlacklist }),
        ...(dto.homeCity !== undefined && { homeCity: dto.homeCity }),
        ...(dto.acceptableCities !== undefined && { acceptableCities: dto.acceptableCities }),
        ...(dto.relocationWillingness !== undefined && {
          relocationWillingness: dto.relocationWillingness,
        }),
        ...(dto.commutePreferenceKm !== undefined && {
          commutePreferenceKm: dto.commutePreferenceKm,
        }),
        ...(dto.portfolioLinks !== undefined && { portfolioLinks: dto.portfolioLinks }),
      },
    });
  }
}
