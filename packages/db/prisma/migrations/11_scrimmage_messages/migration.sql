-- Scrimmage conversation threads: per-side read state + contact sharing, and messages.
ALTER TABLE "ScrimmageRequest" ADD COLUMN "fromReadAt" TIMESTAMP(3);
ALTER TABLE "ScrimmageRequest" ADD COLUMN "toReadAt" TIMESTAMP(3);
ALTER TABLE "ScrimmageRequest" ADD COLUMN "fromShareEmail" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ScrimmageRequest" ADD COLUMN "fromSharePhone" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ScrimmageRequest" ADD COLUMN "toShareEmail" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ScrimmageRequest" ADD COLUMN "toSharePhone" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ScrimmageMessage" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScrimmageMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ScrimmageMessage_requestId_createdAt_idx" ON "ScrimmageMessage"("requestId", "createdAt");
ALTER TABLE "ScrimmageMessage" ADD CONSTRAINT "ScrimmageMessage_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ScrimmageRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
