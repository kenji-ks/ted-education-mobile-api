ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "MfaSetting" (
  "userId" UUID NOT NULL PRIMARY KEY,
  "secretCipher" TEXT,
  "pendingCipher" TEXT,
  "pendingAt" TIMESTAMP(3),
  "enabledAt" TIMESTAMP(3),
  "recoveryHashes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "lastUsedStep" INTEGER NOT NULL DEFAULT -1,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TIMESTAMP(3),
  CONSTRAINT "MfaSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
