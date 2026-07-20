#!/usr/bin/env node
/**
 * Full title-equivalence-class curation engine orchestration (Gate 2 rev B,
 * PR2): fetch real title data (DB via fetch-title-candidates.mjs's query
 * shape, or a JSON file for environments with no DB - see --titles-file) ->
 * aggregate/filter to unresolved candidates -> LLM proposer (real Anthropic
 * or OpenRouter call, whichever key is set) -> auto-screen against
 * TITLE_NEGATIVE_PAIRS -> curation-queue report. Never writes to
 * packages/market-de/src/index.ts directly - every queued proposal needs
 * the same 5-lens human audit every existing class went through before it
 * can be promoted (see the Gate 2 spec's audit plan). This script produces
 * the review artifact, not the approval.
 *
 * Requires:
 * - packages/db, packages/market-de, packages/shared, and apps/api itself
 *   already built (`pnpm --filter @german-smart-apply/db --filter
 *   @german-smart-apply/market-de --filter @german-smart-apply/shared build
 *   && pnpm --filter api build`).
 * - ANTHROPIC_API_KEY or OPENROUTER_API_KEY in the environment (Anthropic
 *   preferred if both are set, matching @german-smart-apply/ai's
 *   createAiProvider precedence).
 * - Either a reachable DATABASE_URL (real canonical_jobs/candidate_profiles
 *   data), or --titles-file pointing at a JSON array of raw title strings
 *   (for environments with no DB access).
 *
 * Usage:
 *   node apps/api/scripts/propose-title-classes.mjs --limit 20 [--titles-file path.json] [--model MODEL]
 *
 * Output: a JSON report written to curation-queue-<timestamp>.json in the
 * current working directory, plus a human-readable summary on stdout.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { getPrismaClient } from '@german-smart-apply/db';
import { marketDe, aggregateTitleFrequencies, filterUnresolvedCandidates, titleEquivalenceIndex, screenProposal } from '@german-smart-apply/market-de';
import { proposeClassAssignment, proposeClassAssignmentViaOpenRouter } from '../dist/jobs/curation/propose-class-assignment.js';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5';
const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-oss-120b:free';

function arg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 ? process.argv[idx + 1] : fallback;
}

/**
 * Picks a real transport based on which key is present - Anthropic
 * preferred, matching @german-smart-apply/ai's createAiProvider precedence
 * (OpenRouter -> Anthropic -> Mock is that factory's own order, chosen
 * there for cost reasons on the runtime path; this script inverts to
 * Anthropic-preferred since strict tool_choice compliance matters more for
 * an auto-screened proposal pipeline than for the runtime AI features).
 */
function resolveProposer(modelArg) {
  if (process.env.ANTHROPIC_API_KEY) {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const model = modelArg ?? DEFAULT_ANTHROPIC_MODEL;
    return { provider: 'anthropic', model, propose: (title, classes) => proposeClassAssignment(client, title, classes, model) };
  }
  if (process.env.OPENROUTER_API_KEY) {
    const client = new OpenAI({ apiKey: process.env.OPENROUTER_API_KEY, baseURL: OPENROUTER_BASE_URL });
    const model = modelArg ?? DEFAULT_OPENROUTER_MODEL;
    return { provider: 'openrouter', model, propose: (title, classes) => proposeClassAssignmentViaOpenRouter(client, title, classes, model) };
  }
  return null;
}

async function loadRawTitles() {
  const titlesFile = arg('titles-file');
  if (titlesFile) {
    const raw = readFileSync(titlesFile, 'utf8').replace(/^﻿/, '');
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) {
      throw new Error('--titles-file must contain a JSON array of raw title strings');
    }
    console.log(`Loaded ${data.length} raw titles from ${titlesFile} (no-DB mode).`);
    return data;
  }

  const prisma = getPrismaClient();
  const [jobTitles, profileTitles] = await Promise.all([
    prisma.canonicalJob.findMany({ select: { jobTitleNormalized: true } }),
    prisma.candidateProfile.findMany({ select: { targetRole: true } }),
  ]);
  await prisma.$disconnect();
  console.log(`Loaded ${jobTitles.length} job titles + ${profileTitles.length} candidate targetRoles from the database.`);
  return [...jobTitles.map((j) => j.jobTitleNormalized), ...profileTitles.map((p) => p.targetRole)];
}

async function main() {
  const limit = Number(arg('limit', '20'));
  const proposer = resolveProposer(arg('model'));
  if (!proposer) {
    console.error('Neither ANTHROPIC_API_KEY nor OPENROUTER_API_KEY is set. One is required to run the LLM proposer step.');
    process.exitCode = 1;
    return;
  }
  console.log(`Using ${proposer.provider} (${proposer.model}) for the proposer step.`);

  const rawTitles = await loadRawTitles();
  if (rawTitles.length === 0) {
    console.log('No titles found (empty database and no --titles-file). Nothing to curate yet - not an error.');
    return;
  }

  const frequencies = aggregateTitleFrequencies(rawTitles);
  const unresolved = filterUnresolvedCandidates(frequencies, titleEquivalenceIndex);
  const candidates = unresolved.slice(0, limit);

  console.log(`${frequencies.length} distinct titles, ${unresolved.length} unresolved, proposing classifications for the top ${candidates.length} by frequency.\n`);

  const results = [];

  for (const candidate of candidates) {
    try {
      const proposal = await proposer.propose(candidate.title, marketDe.titleEquivalenceClasses);
      if (proposal.proposedClassId === 'none') {
        console.log(`  "${candidate.title}" (x${candidate.count}) -> no match proposed (confidence ${proposal.confidence})`);
        results.push({ ...candidate, proposal, screen: { status: 'no-match-proposed' } });
        continue;
      }
      const screened = screenProposal({ candidateTitle: candidate.title, proposedClassId: proposal.proposedClassId, confidence: proposal.confidence, reasoning: proposal.reasoning }, marketDe.titleEquivalenceClasses);
      console.log(`  "${candidate.title}" (x${candidate.count}) -> proposed "${proposal.proposedClassId}" (confidence ${proposal.confidence}) -> ${screened.status}${screened.screenReason ? ` (${screened.screenReason})` : ''}`);
      results.push({ ...candidate, proposal, screen: screened });
    } catch (err) {
      console.error(`  "${candidate.title}" -> LLM call failed: ${err.message}`);
      results.push({ ...candidate, error: err.message });
    }
  }

  const queuedForReview = results.filter((r) => r.screen?.status === 'queued-for-review');
  const autoRejected = results.filter((r) => r.screen?.status === 'auto-rejected');
  const noMatch = results.filter((r) => r.screen?.status === 'no-match-proposed');

  console.log(`\nSummary: ${queuedForReview.length} queued for human review, ${autoRejected.length} auto-rejected (negative-pair collision), ${noMatch.length} no match proposed.`);

  const outPath = `curation-queue-${Date.now()}.json`;
  writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), provider: proposer.provider, model: proposer.model, totalCandidatesConsidered: candidates.length, results }, null, 2), 'utf8');
  console.log(`\nFull report written to ${outPath}. Nothing here is auto-applied - review "queued-for-review" entries against the same 5-lens audit process before adding any of them to packages/market-de/src/index.ts's titleEquivalenceClasses.`);
}

main().catch((err) => {
  console.error('propose-title-classes failed:', err);
  process.exitCode = 1;
});
