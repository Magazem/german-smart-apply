-- AlterTable
-- Deliberately nullable with no backfill: this table is ~748k rows / ~3 GB of
-- TOASTed JSON on production, and an UPDATE ... SET "payloadHash" = md5(...)
-- would rewrite every row, briefly doubling the storage of the very table this
-- change exists to shrink. Pre-existing rows keep NULL; crawler/runner.py
-- hashes the single latest payload on read when the stored hash is NULL.
-- workers/scripts/prune_raw_job_snapshots.py fills the hash for surviving rows
-- as part of its table rewrite.
ALTER TABLE "raw_job_snapshots" ADD COLUMN "payloadHash" TEXT;

-- CreateIndex
-- Supports the "latest snapshot for this (source, job)" lookup the runner now
-- does once per fetched payload, replacing a COUNT(*) over that job's whole
-- history (which got linearly more expensive with every crawl).
CREATE INDEX "raw_job_snapshots_sourceId_originalJobId_fetchedAt_idx" ON "raw_job_snapshots"("sourceId", "originalJobId", "fetchedAt" DESC);

-- DropIndex
-- Now an exact prefix of the index above, which serves every query it did.
-- Keeping it would just add a second index write to every snapshot insert.
DROP INDEX "raw_job_snapshots_sourceId_originalJobId_idx";
