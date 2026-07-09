-- CreateEnum
CREATE TYPE "TrustTier" AS ENUM ('high', 'medium', 'low');

-- CreateEnum
CREATE TYPE "CrawlRunStatus" AS ENUM ('running', 'success', 'partial_failure', 'failure');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('free', 'pro', 'canceled', 'past_due');

-- CreateEnum
CREATE TYPE "InteractionType" AS ENUM ('view', 'like', 'skip', 'share');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('new', 'viewed', 'saved', 'draft_ready', 'awaiting_approval', 'applied', 'interview', 'rejected', 'offer', 'archived');

-- CreateTable
CREATE TABLE "sources" (
    "id" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "trustTier" "TrustTier" NOT NULL DEFAULT 'medium',
    "crawlFrequencyMinutes" INTEGER NOT NULL DEFAULT 360,
    "config" JSONB NOT NULL DEFAULT '{}',
    "domainAllowlist" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_crawl_runs" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "status" "CrawlRunStatus" NOT NULL DEFAULT 'running',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "jobsFetched" INTEGER NOT NULL DEFAULT 0,
    "jobsNew" INTEGER NOT NULL DEFAULT 0,
    "jobsUpdated" INTEGER NOT NULL DEFAULT 0,
    "errorLog" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "source_crawl_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_job_snapshots" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "originalJobId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_job_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_jobs" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "originalJobId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "companyNameRaw" TEXT NOT NULL,
    "companyNameNormalized" TEXT NOT NULL,
    "jobTitleRaw" TEXT NOT NULL,
    "jobTitleNormalized" TEXT NOT NULL,
    "jobDescriptionHtml" TEXT,
    "jobDescriptionText" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "locationRaw" TEXT NOT NULL,
    "locationNormalized" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "remoteType" TEXT NOT NULL,
    "employmentType" TEXT NOT NULL,
    "seniority" TEXT,
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "salaryCurrency" TEXT,
    "techStackTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "applyUrl" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3),
    "crawledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceTrustScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "scamRiskScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isDeduplicated" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canonical_jobs" (
    "id" TEXT NOT NULL,
    "rawJobId" TEXT NOT NULL,
    "companyNameNormalized" TEXT NOT NULL,
    "jobTitleNormalized" TEXT NOT NULL,
    "locationNormalized" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "remoteType" TEXT NOT NULL,
    "employmentType" TEXT NOT NULL,
    "seniority" TEXT,
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "salaryCurrency" TEXT,
    "techStackTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "language" TEXT NOT NULL,
    "sourceTrustScore" DOUBLE PRECISION NOT NULL,
    "scamRiskScore" DOUBLE PRECISION NOT NULL,
    "duplicateConfidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "postedAt" TIMESTAMP(3),
    "crawledAt" TIMESTAMP(3) NOT NULL,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canonical_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duplicate_clusters" (
    "id" TEXT NOT NULL,
    "canonicalJobId" TEXT NOT NULL,
    "clusterKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "duplicate_clusters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duplicate_cluster_members" (
    "id" TEXT NOT NULL,
    "duplicateClusterId" TEXT NOT NULL,
    "rawJobId" TEXT NOT NULL,
    "similarityScore" DOUBLE PRECISION NOT NULL,
    "isCanonicalPick" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "duplicate_cluster_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_aliases" (
    "id" TEXT NOT NULL,
    "companyNameNormalized" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "aliasType" TEXT NOT NULL DEFAULT 'variant',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "authProviderId" TEXT,
    "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'free',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT,
    "targetRole" TEXT NOT NULL,
    "targetCountryCode" TEXT NOT NULL DEFAULT 'DE',
    "preferredLanguage" TEXT NOT NULL DEFAULT 'en',
    "seniority" TEXT NOT NULL,
    "locationPreference" TEXT NOT NULL DEFAULT 'any',
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "summary" TEXT,
    "salaryTargetMin" INTEGER,
    "salaryTargetMax" INTEGER,
    "workAuthorization" TEXT,
    "companyBlacklist" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "commutePreferenceKm" INTEGER,
    "portfolioLinks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cv_documents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "parsedResult" JSONB,
    "parseStatus" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cv_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_jobs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "canonicalJobId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_interactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "canonicalJobId" TEXT NOT NULL,
    "interactionType" "InteractionType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "canonicalJobId" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_drafts" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "cvVariantText" TEXT NOT NULL,
    "coverLetterText" TEXT NOT NULL,
    "modelUsed" TEXT NOT NULL,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_events" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "fromStatus" "ApplicationStatus",
    "toStatus" "ApplicationStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_searches" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_searches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_deliveries" (
    "id" TEXT NOT NULL,
    "savedSearchId" TEXT NOT NULL,
    "jobIds" TEXT[],
    "channel" TEXT NOT NULL DEFAULT 'email',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sources_countryCode_idx" ON "sources"("countryCode");

-- CreateIndex
CREATE INDEX "source_crawl_runs_sourceId_startedAt_idx" ON "source_crawl_runs"("sourceId", "startedAt");

-- CreateIndex
CREATE INDEX "raw_job_snapshots_sourceId_originalJobId_idx" ON "raw_job_snapshots"("sourceId", "originalJobId");

-- CreateIndex
CREATE INDEX "raw_jobs_companyNameNormalized_jobTitleNormalized_locationN_idx" ON "raw_jobs"("companyNameNormalized", "jobTitleNormalized", "locationNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "raw_jobs_sourceId_originalJobId_key" ON "raw_jobs"("sourceId", "originalJobId");

-- CreateIndex
CREATE UNIQUE INDEX "canonical_jobs_rawJobId_key" ON "canonical_jobs"("rawJobId");

-- CreateIndex
CREATE INDEX "canonical_jobs_countryCode_jobTitleNormalized_idx" ON "canonical_jobs"("countryCode", "jobTitleNormalized");

-- CreateIndex
CREATE INDEX "canonical_jobs_companyNameNormalized_idx" ON "canonical_jobs"("companyNameNormalized");

-- CreateIndex
CREATE INDEX "duplicate_clusters_clusterKey_idx" ON "duplicate_clusters"("clusterKey");

-- CreateIndex
CREATE UNIQUE INDEX "duplicate_cluster_members_duplicateClusterId_rawJobId_key" ON "duplicate_cluster_members"("duplicateClusterId", "rawJobId");

-- CreateIndex
CREATE INDEX "company_aliases_alias_idx" ON "company_aliases"("alias");

-- CreateIndex
CREATE UNIQUE INDEX "company_aliases_companyNameNormalized_alias_key" ON "company_aliases"("companyNameNormalized", "alias");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_authProviderId_key" ON "users"("authProviderId");

-- CreateIndex
CREATE UNIQUE INDEX "users_stripeCustomerId_key" ON "users"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "users_stripeSubscriptionId_key" ON "users"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_profiles_userId_key" ON "candidate_profiles"("userId");

-- CreateIndex
CREATE INDEX "cv_documents_userId_idx" ON "cv_documents"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "saved_jobs_userId_canonicalJobId_key" ON "saved_jobs"("userId", "canonicalJobId");

-- CreateIndex
CREATE INDEX "job_interactions_userId_canonicalJobId_idx" ON "job_interactions"("userId", "canonicalJobId");

-- CreateIndex
CREATE INDEX "applications_userId_status_idx" ON "applications"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "applications_userId_canonicalJobId_key" ON "applications"("userId", "canonicalJobId");

-- CreateIndex
CREATE INDEX "application_drafts_applicationId_idx" ON "application_drafts"("applicationId");

-- CreateIndex
CREATE INDEX "application_events_applicationId_idx" ON "application_events"("applicationId");

-- CreateIndex
CREATE INDEX "saved_searches_userId_idx" ON "saved_searches"("userId");

-- CreateIndex
CREATE INDEX "alert_deliveries_savedSearchId_idx" ON "alert_deliveries"("savedSearchId");

-- AddForeignKey
ALTER TABLE "source_crawl_runs" ADD CONSTRAINT "source_crawl_runs_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_job_snapshots" ADD CONSTRAINT "raw_job_snapshots_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_jobs" ADD CONSTRAINT "raw_jobs_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canonical_jobs" ADD CONSTRAINT "canonical_jobs_rawJobId_fkey" FOREIGN KEY ("rawJobId") REFERENCES "raw_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duplicate_clusters" ADD CONSTRAINT "duplicate_clusters_canonicalJobId_fkey" FOREIGN KEY ("canonicalJobId") REFERENCES "canonical_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duplicate_cluster_members" ADD CONSTRAINT "duplicate_cluster_members_duplicateClusterId_fkey" FOREIGN KEY ("duplicateClusterId") REFERENCES "duplicate_clusters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duplicate_cluster_members" ADD CONSTRAINT "duplicate_cluster_members_rawJobId_fkey" FOREIGN KEY ("rawJobId") REFERENCES "raw_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_profiles" ADD CONSTRAINT "candidate_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_documents" ADD CONSTRAINT "cv_documents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_jobs" ADD CONSTRAINT "saved_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_jobs" ADD CONSTRAINT "saved_jobs_canonicalJobId_fkey" FOREIGN KEY ("canonicalJobId") REFERENCES "canonical_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_interactions" ADD CONSTRAINT "job_interactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_interactions" ADD CONSTRAINT "job_interactions_canonicalJobId_fkey" FOREIGN KEY ("canonicalJobId") REFERENCES "canonical_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_canonicalJobId_fkey" FOREIGN KEY ("canonicalJobId") REFERENCES "canonical_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_drafts" ADD CONSTRAINT "application_drafts_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_deliveries" ADD CONSTRAINT "alert_deliveries_savedSearchId_fkey" FOREIGN KEY ("savedSearchId") REFERENCES "saved_searches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
