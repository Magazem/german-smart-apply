import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createAiProvider } from '@german-smart-apply/ai';
import type { Prisma } from '@german-smart-apply/db';
import type { ParsedCvResult } from '@german-smart-apply/shared';
import pdfParse from 'pdf-parse';
import * as mammoth from 'mammoth';
import { PrismaService } from '../prisma/prisma.service.js';

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
  private readonly aiProvider = createAiProvider();

  constructor(private readonly prisma: PrismaService) {}

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
      const parsed = await this.aiProvider.parseCv(text, language);

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
          targetRole: parsed.experience[0]?.title ?? 'Not specified yet',
          summary: parsed.summary,
          skills: parsed.skills,
          seniority: 'mid',
        },
      });
    }

    return this.prisma.client.candidateProfile.update({
      where: { userId },
      data: {
        fullName: existing.fullName ?? parsed.fullName,
        summary: existing.summary ?? parsed.summary,
        skills: existing.skills.length > 0 ? existing.skills : parsed.skills,
      },
    });
  }
}
