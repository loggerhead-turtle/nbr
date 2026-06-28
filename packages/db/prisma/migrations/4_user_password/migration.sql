-- Email+password auth for coach accounts.
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;
