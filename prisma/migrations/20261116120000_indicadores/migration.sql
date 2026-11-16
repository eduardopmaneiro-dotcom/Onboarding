-- CreateEnum
CREATE TYPE "SlaStage" AS ENUM ('ABERTURA_PRIMEIRA_ENTREVISTA', 'ENTREVISTA_APROVACAO_RH', 'APROVACAO_RH_GESTOR', 'APROVACAO_ADMISSAO', 'ABERTURA_CONTRATACAO');

-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "hiredAt" TIMESTAMP(3),
ADD COLUMN     "hiredById" TEXT;

-- CreateTable
CREATE TABLE "SlaTarget" (
    "id" TEXT NOT NULL,
    "stage" "SlaStage" NOT NULL,
    "positionId" TEXT,
    "departmentName" TEXT,
    "targetDays" DOUBLE PRECISION NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlaTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SlaTarget_stage_positionId_departmentName_key" ON "SlaTarget"("stage", "positionId", "departmentName");

-- AddForeignKey
ALTER TABLE "SlaTarget" ADD CONSTRAINT "SlaTarget_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Retroativo: data da aprovação final das candidaturas já aprovadas = decisão do gestor (ou última atualização)
UPDATE "Application" a SET "approvedAt" = COALESCE(
  (SELECT max(r."decidedAt") FROM "ManagerReview" r WHERE r."applicationId" = a.id AND r."status" = 'APROVADO'),
  a."updatedAt")
WHERE a."status" IN ('APROVADO', 'CONTRATADO') AND a."approvedAt" IS NULL;

ALTER TABLE "SlaTarget" ADD CONSTRAINT sla_target_positive_chk CHECK ("targetDays" > 0 AND "targetDays" <= 365);
-- Contratação exige aprovação antes
ALTER TABLE "Application" ADD CONSTRAINT application_hired_after_approval_chk CHECK ("hiredAt" IS NULL OR "approvedAt" IS NOT NULL);
