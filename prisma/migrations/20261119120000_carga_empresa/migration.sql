-- AlterEnum
ALTER TYPE "ContractType" ADD VALUE 'APRENDIZ';

-- AlterTable
ALTER TABLE "ChargeRate" ADD COLUMN     "apprenticeRatePct" DECIMAL(7,4);

-- AlterTable
ALTER TABLE "JobDescription" ADD COLUMN     "behavioralProfile" TEXT;

-- AlterTable
ALTER TABLE "PayItem" ADD COLUMN     "rubric" TEXT,
ADD COLUMN     "source" TEXT;

-- AlterTable
ALTER TABLE "Position" ADD COLUMN     "levelConfirmed" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ChargeRateUnit" (
    "id" TEXT NOT NULL,
    "rateId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "ratePct" DECIMAL(7,4) NOT NULL,

    CONSTRAINT "ChargeRateUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataImport" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "competence" TEXT,
    "summary" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChargeRateUnit_rateId_unitId_key" ON "ChargeRateUnit"("rateId", "unitId");

-- CreateIndex
CREATE INDEX "DataImport_sha256_idx" ON "DataImport"("sha256");

-- AddForeignKey
ALTER TABLE "ChargeRateUnit" ADD CONSTRAINT "ChargeRateUnit_rateId_fkey" FOREIGN KEY ("rateId") REFERENCES "ChargeRate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargeRateUnit" ADD CONSTRAINT "ChargeRateUnit_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ChargeRateUnit" ADD CONSTRAINT charge_rate_unit_chk CHECK ("ratePct" >= 0 AND "ratePct" <= 100);
