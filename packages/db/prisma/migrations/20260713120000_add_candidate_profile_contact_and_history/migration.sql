-- AlterTable
ALTER TABLE "candidate_profiles" ADD COLUMN     "email" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "experience" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "education" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "languages" TEXT[] DEFAULT ARRAY[]::TEXT[];
