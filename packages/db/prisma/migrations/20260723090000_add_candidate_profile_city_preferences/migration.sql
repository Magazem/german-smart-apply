-- AlterTable
ALTER TABLE "candidate_profiles" ADD COLUMN     "homeCity" TEXT,
ADD COLUMN     "acceptableCities" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "relocationWillingness" TEXT;
