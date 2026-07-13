-- CreateTable
CREATE TABLE "role_gap_analyses" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetRole" TEXT NOT NULL,
    "matchingSkills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "missingSkills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "suggestedLearningTopics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "suggestedCertifications" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "estimatedReadinessScore" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "sampleJobCount" INTEGER NOT NULL DEFAULT 0,
    "modelUsed" TEXT NOT NULL,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_gap_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "role_gap_analyses_userId_createdAt_idx" ON "role_gap_analyses"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "role_gap_analyses" ADD CONSTRAINT "role_gap_analyses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
