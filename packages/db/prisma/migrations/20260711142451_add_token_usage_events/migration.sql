-- CreateTable
CREATE TABLE "token_usage_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "modelUsed" TEXT NOT NULL,
    "tokensUsed" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "token_usage_events_userId_feature_idx" ON "token_usage_events"("userId", "feature");

-- AddForeignKey
ALTER TABLE "token_usage_events" ADD CONSTRAINT "token_usage_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
