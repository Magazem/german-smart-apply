import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@german-smart-apply/db';
import type { ParsedCvResult } from '@german-smart-apply/shared';
import pdfParse from 'pdf-parse';
import * as mammoth from 'mammoth';
import { AiProviderFactory } from '../ai/ai-provider-factory.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TokenUsageService } from '../token-usage/token-usage.service.js';

// TODO: Phase-later — move CV storage to S3-compatible object storage per
// plan.md's stack table. Local disk is a fine stand-in for the sandbox/dev.
const UPLOAD_DIR = process.env.CV_UPLOAD_DIR ?? join(process.cwd(), 'uploads', 'cv');

export interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

const SUPPORTED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]);

@Injectable()
export class CvService {
  private readonly logger = new Logger(CvService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenUsage: TokenUsageService,
    private readonly aiProviderFactory: AiProviderFactory,
  ) {}

  async uploadAndParse(userId: string, file: UploadedFileLike, language = 'en') {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    if (!SUPPORTED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type "${file.mimetype}". Upload a PDF, DOCX, or plain-text CV.`,
      );
    }

    await mkdir(UPLOAD_DIR, { recursive: true });
    const storageKey = `${userId}/${randomUUID()}-${file.originalname}`;
    const diskPath = join(UPLOAD_DIR, storageKey.replace(/\//g, '_'));
    await writeFile(diskPath, file.buffer);

    const cvDocument = await this.prisma.client.cvDocument.create({
      data: {
        userId,
        fileName: file.originalname,
        storageKey: diskPath,
        mimeType: file.mimetype,
        parseStatus: 'pending',
      },
    });

    try {
      const text = await this.extractText(file.buffer, file.mimetype);
      const aiProvider = await this.aiProviderFactory.getProvider();
      const { parsed, modelUsed, tokensUsed } = await aiProvider.parseCv(text, language);
      await this.tokenUsage.record(userId, 'parseCv', modelUsed, tokensUsed);

      const updatedDocument = await this.prisma.client.cvDocument.update({
        where: { id: cvDocument.id },
        data: { parsedResult: parsed as unknown as Prisma.InputJsonValue, parseStatus: 'parsed' },
      });

      const profile = await this.prefillProfile(userId, parsed);

      return { cvDocument: updatedDocument, parsed, profile };
    } catch (error) {
      this.logger.error(`CV parse failed for document ${cvDocument.id}`, error);
      await this.prisma.client.cvDocument.update({
        where: { id: cvDocument.id },
        data: { parseStatus: 'failed' },
      });
      throw error;
    }
  }

  async getLastParsed(userId: string): Promise<ParsedCvResult> {
    const document = await this.prisma.client.cvDocument.findFirst({
      where: { userId, parseStatus: 'parsed' },
      orderBy: { createdAt: 'desc' },
    });
    if (!document || !document.parsedResult) {
      throw new NotFoundException('No parsed CV yet — POST /cv/upload first');
    }
    return document.parsedResult as unknown as ParsedCvResult;
  }

  private async extractText(buffer: Buffer, mimeType: string): Promise<string> {
    if (mimeType === 'application/pdf') {
      const result = await pdfParse(buffer);
      return result.text;
    }
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
    return buffer.toString('utf-8');
  }

  /**
   * Uses the parsed CV to prefill/update fields the user hasn't set yet on
   * their candidate profile. Never overwrites a field the user already has —
   * CV parsing assists onboarding, it doesn't silently clobber edits.
   */
  private async prefillProfile(userId: string, parsed: ParsedCvResult) {
    const existing = await this.prisma.client.candidateProfile.findUnique({
      where: { userId },
    });

    if (!existing) {
      return this.prisma.client.candidateProfile.create({
        data: {
          userId,
          fullName: parsed.fullName,
          email: parsed.email,
          phone: parsed.phone,
          targetRole: parsed.experience[0]?.title ?? 'Not specified yet',
          summary: parsed.summary,
          skills: parsed.skills,
          experience: parsed.experience as unknown as Prisma.InputJsonValue,
          education: parsed.education as unknown as Prisma.InputJsonValue,
          languages: parsed.languages,
          seniority: 'mid',
        },
      });
    }

    return this.prisma.client.candidateProfile.update({
      where: { userId },
      data: {
        // An empty string isn't a value the user "has" - treat it the same
        // as null/undefined so a later CV parse can still fill it in.
        fullName: existing.fullName || parsed.fullName,
        email: existing.email || parsed.email,
        phone: existing.phone || parsed.phone,
        summary: existing.summary || parsed.summary,
        skills: existing.skills.length > 0 ? existing.skills : parsed.skills,
        experience: (Array.isArray(existing.experience) && existing.experience.length > 0
          ? existing.experience
          : parsed.experience) as unknown as Prisma.InputJsonValue,
        education: (Array.isArray(existing.education) && existing.education.length > 0
          ? existing.education
          : parsed.education) as unknown as Prisma.InputJsonValue,
        languages: existing.languages.length > 0 ? existing.languages : parsed.languages,
      },
    });
  }
}
