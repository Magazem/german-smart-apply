#!/usr/bin/env node
/**
 * One-time backfill: copies email/phone/experience/education/languages from
 * each user's most recent parsed CV (cv_documents.parsedResult) onto their
 * candidate_profiles row, wherever that field is still empty there.
 *
 * Why this is needed: the migration that added these columns to
 * candidate_profiles (20260713120000_add_candidate_profile_contact_and_history)
 * is schema-only - it does not retroactively populate existing rows. Every
 * user who uploaded a CV *before* that migration shipped has a profile with
 * genuinely empty values for these fields, even though the original parse
 * already extracted them correctly and they're sitting right there in
 * cv_documents.parsedResult. Going forward, a fresh CV upload populates these
 * fields automatically (see apps/api/src/cv/cv.service.ts's prefillProfile) -
 * this script only needs to run once, to catch up everyone who uploaded
 * before that fix existed.
 *
 * Safe to run multiple times (idempotent) and safe to run against a profile
 * a user has already edited themselves: exactly mirrors prefillProfile's own
 * "never overwrite non-empty real data" rule - only fills fields that are
 * currently null/empty, never touches a field that already has a value.
 *
 * Usage:
 *   cd packages/db
 *   $env:DATABASE_URL = "<production DATABASE_URL>"   # PowerShell
 *   node scripts/backfill-profile-from-parsed-cv.mjs
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function isEmptyArray(value) {
  return !Array.isArray(value) || value.length === 0;
}

async function main() {
  const profiles = await prisma.candidateProfile.findMany();
  let updated = 0;
  let skippedNoParsedCv = 0;
  let skippedAlreadyComplete = 0;

  for (const profile of profiles) {
    const needsEmail = !profile.email;
    const needsPhone = !profile.phone;
    const needsExperience = isEmptyArray(profile.experience);
    const needsEducation = isEmptyArray(profile.education);
    const needsLanguages = profile.languages.length === 0;

    if (!needsEmail && !needsPhone && !needsExperience && !needsEducation && !needsLanguages) {
      skippedAlreadyComplete += 1;
      continue;
    }

    const lastParsedCv = await prisma.cvDocument.findFirst({
      where: { userId: profile.userId, parseStatus: 'parsed' },
      orderBy: { createdAt: 'desc' },
    });
    const parsed = lastParsedCv?.parsedResult;
    if (!parsed || typeof parsed !== 'object') {
      skippedNoParsedCv += 1;
      continue;
    }

    await prisma.candidateProfile.update({
      where: { userId: profile.userId },
      data: {
        ...(needsEmail && parsed.email ? { email: parsed.email } : {}),
        ...(needsPhone && parsed.phone ? { phone: parsed.phone } : {}),
        ...(needsExperience && Array.isArray(parsed.experience) ? { experience: parsed.experience } : {}),
        ...(needsEducation && Array.isArray(parsed.education) ? { education: parsed.education } : {}),
        ...(needsLanguages && Array.isArray(parsed.languages) ? { languages: parsed.languages } : {}),
      },
    });
    updated += 1;
    console.log(`Backfilled profile for user ${profile.userId}`);
  }

  console.log(
    `Done. ${updated} profile(s) backfilled, ${skippedAlreadyComplete} already complete, ` +
      `${skippedNoParsedCv} had no parsed CV to backfill from.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
