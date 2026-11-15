-- CreateEnum
CREATE TYPE "DigestType" AS ENUM ('AGENDA', 'FECHAMENTO');

-- CreateEnum
CREATE TYPE "DigestStatus" AS ENUM ('PENDENTE', 'AGUARDANDO_REVISAO', 'EMITIDO', 'DESCARTADO', 'SEM_DESTINATARIO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationStatus" ADD VALUE 'ENVIANDO';
ALTER TYPE "NotificationStatus" ADD VALUE 'CANCELADA';

-- DropIndex
DROP INDEX "Notification_status_scheduledFor_idx";

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cc" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "digestId" TEXT,
ADD COLUMN     "htmlBody" TEXT,
ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "maxAttempts" INTEGER NOT NULL DEFAULT 6,
ADD COLUMN     "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "providerId" TEXT;

-- CreateTable
CREATE TABLE "ManagerDigest" (
    "id" TEXT NOT NULL,
    "type" "DigestType" NOT NULL,
    "managerId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "DigestStatus" NOT NULL DEFAULT 'PENDENTE',
    "isRectification" BOOLEAN NOT NULL DEFAULT false,
    "hold" BOOLEAN NOT NULL DEFAULT false,
    "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subject" TEXT,
    "bodyText" TEXT,
    "customSubject" TEXT,
    "customBody" TEXT,
    "customForHash" TEXT,
    "editedById" TEXT,
    "editedAt" TIMESTAMP(3),
    "snapshot" JSONB,
    "snapshotHash" TEXT,
    "note" TEXT,
    "emittedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagerDigest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyClosing" (
    "date" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedById" TEXT,
    "pendingCount" INTEGER NOT NULL DEFAULT 0,
    "summary" JSONB,

    CONSTRAINT "DailyClosing_pkey" PRIMARY KEY ("date")
);

-- CreateTable
CREATE TABLE "SystemLock" (
    "name" TEXT NOT NULL,
    "lockedUntil" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemLock_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE INDEX "ManagerDigest_status_scheduledFor_idx" ON "ManagerDigest"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "ManagerDigest_date_idx" ON "ManagerDigest"("date");

-- CreateIndex
CREATE UNIQUE INDEX "ManagerDigest_type_managerId_date_version_key" ON "ManagerDigest"("type", "managerId", "date", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_digestId_key" ON "Notification"("digestId");

-- CreateIndex
CREATE INDEX "Notification_status_nextAttemptAt_idx" ON "Notification"("status", "nextAttemptAt");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_digestId_fkey" FOREIGN KEY ("digestId") REFERENCES "ManagerDigest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerDigest" ADD CONSTRAINT "ManagerDigest_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Manager"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

