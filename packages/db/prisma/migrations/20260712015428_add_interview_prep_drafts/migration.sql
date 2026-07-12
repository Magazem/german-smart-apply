-- CreateTable
CREATE TABLE "interview_prep_drafts" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "questions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "talkingPoints" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "modelUsed" TEXT NOT NULL,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_prep_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "interview_prep_drafts_applicationId_idx" ON "interview_prep_drafts"("applicationId");

-- AddForeignKey
ALTER TABLE "interview_prep_drafts" ADD CONSTRAINT "interview_prep_drafts_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
