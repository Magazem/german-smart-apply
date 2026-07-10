import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@german-smart-apply/db';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateSavedSearchDto } from './dto/create-saved-search.dto.js';
import type { UpdateSavedSearchDto } from './dto/update-saved-search.dto.js';

@Injectable()
export class SavedSearchesService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.client.savedSearch.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOne(userId: string, id: string) {
    const savedSearch = await this.prisma.client.savedSearch.findUnique({ where: { id } });
    if (!savedSearch || savedSearch.userId !== userId) {
      throw new NotFoundException('Saved search not found');
    }
    return savedSearch;
  }

  create(userId: string, dto: CreateSavedSearchDto) {
    return this.prisma.client.savedSearch.create({
      data: {
        userId,
        name: dto.name,
        filters: dto.filters as Prisma.InputJsonValue,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateSavedSearchDto) {
    await this.getOne(userId, id);
    return this.prisma.client.savedSearch.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.filters !== undefined && { filters: dto.filters as Prisma.InputJsonValue }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async remove(userId: string, id: string) {
    await this.getOne(userId, id);
    await this.prisma.client.savedSearch.delete({ where: { id } });
    return { success: true };
  }
}
