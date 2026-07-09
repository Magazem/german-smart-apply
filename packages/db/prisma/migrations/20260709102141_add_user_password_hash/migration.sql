-- Additive migration: dev-mode local email+password auth stand-in.
-- TODO: swap for Clerk/NextAuth when API keys are available.
ALTER TABLE "users" ADD COLUMN "passwordHash" TEXT;
