#!/usr/bin/env node
/**
 * Production data source for the title-equivalence-class curation engine
 * (Gate 2 rev B, PR2). Queries real canonical_jobs.jobTitleNormalized and
 * candidate_profiles.targetRole via the shared Prisma client (no NestJS
 * bootstrap needed - same pattern as packages/db/scripts/
 * backfill-profile-from-parsed-cv.mjs), feeds the raw title strings into
 * @german-smart-apply/market-de's pure aggregateTitleFrequencies/
 * filterUnresolvedCandidates, and prints the top unresolved candidates by
 * frequency.
 *
 * Requires packages/db, packages/market-de, and packages/shared already
 * built (`pnpm --filter @german-smart-apply/db --filter
 * @german-smart-apply/market-de --filter @german-smart-apply/shared build`)
 * and a real DATABASE_URL - there is no TS-execution tooling in this repo
 * (no tsx/ts-node), matching the existing .mjs script precedent.
 *
 * Usage: node apps/api/scripts/fetch-title-candidates.mjs [--limit N]
 */
import { getPrismaClient } from '@german-smart-apply/db';
import { aggregateTitleFrequencies, filterUnresolvedCandidates, titleEquivalenceIndex } from '@german-smart-apply/market-de';

const limitArg = process.argv.indexOf('--limit');
const limit = limitArg !== -1 ? Number(process.argv[limitArg + 1]) : 50;

async function main() {
  const prisma = getPrismaClient();

  const [jobTitles, profileTitles] = await Promise.all([
    prisma.canonicalJob.findMany({ select: { jobTitleNormalized: true } }),
    prisma.candidateProfile.findMany({ select: { targetRole: true } }),
  ]);

  const rawTitles = [...jobTitles.map((j) => j.jobTitleNormalized), ...profileTitles.map((p) => p.targetRole)];

  if (rawTitles.length === 0) {
    console.log('No job or candidate-profile titles found in the database yet (canonical_jobs/candidate_profiles are empty).');
    console.log('This is expected before the first real crawl/signups have run - nothing to curate yet, not an error.');
    await prisma.$disconnect();
    return;
  }

  const frequencies = aggregateTitleFrequencies(rawTitles);
  const unresolved = filterUnresolvedCandidates(frequencies, titleEquivalenceIndex);

  console.log(`Total titles: ${rawTitles.length} (${jobTitles.length} jobs, ${profileTitles.length} candidate profiles)`);
  console.log(`Distinct normalized titles: ${frequencies.length}`);
  console.log(`Unresolved (not already in a Tier 2 class): ${unresolved.length}`);
  console.log(`\nTop ${Math.min(limit, unresolved.length)} unresolved candidates by frequency:`);
  for (const f of unresolved.slice(0, limit)) {
    console.log(`  ${String(f.count).padStart(4)}  "${f.title}"`);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('fetch-title-candidates failed:', err);
  process.exitCode = 1;
});
