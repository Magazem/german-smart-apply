-- CreateTable
CREATE TABLE "follow_up_drafts" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "modelUsed" TEXT NOT NULL,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follow_up_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "follow_up_drafts_applicationId_idx" ON "follow_up_drafts"("applicationId");

-- AddForeignKey
ALTER TABLE "follow_up_drafts" ADD CONSTRAINT "follow_up_drafts_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
