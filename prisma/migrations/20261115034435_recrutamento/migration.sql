/*
  Warnings:

  - You are about to drop the column `interviewerId` on the `Interview` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "WorkSchedule" AS ENUM ('SEIS_POR_UM', 'CINCO_POR_DOIS', 'DOZE_POR_TRINTA_E_SEIS', 'OUTRA');

-- CreateEnum
CREATE TYPE "WorkShift" AS ENUM ('DIURNO', 'NOTURNO', 'MISTO', 'ADMINISTRATIVO');

-- CreateEnum
CREATE TYPE "ExternalCheckStatus" AS ENUM ('NAO_APLICA', 'AGUARDANDO', 'APROVADO', 'REPROVADO');

-- CreateEnum
CREATE TYPE "InterviewResult" AS ENUM ('PENDENTE', 'APROVADO', 'REPROVADO', 'NAO_COMPARECEU', 'DESISTIU');

-- CreateEnum
CREATE TYPE "ManagerDecision" AS ENUM ('PENDENTE', 'APROVADO', 'REPROVADO', 'NOVA_ENTREVISTA');

-- CreateEnum
CREATE TYPE "CandidateEventType" AS ENUM ('CADASTRO', 'EDICAO', 'CANDIDATURA', 'ENTREVISTA_AGENDADA', 'ENTREVISTA_REMARCADA', 'ENTREVISTA_CANCELADA', 'RESULTADO_RH', 'AVALIACAO_EXTERNA', 'ENCAMINHADO_GESTOR', 'DECISAO_GESTOR', 'STATUS', 'SALARIO', 'IMPORTACAO', 'OBSERVACAO');

-- CreateEnum
CREATE TYPE "ImportBatchStatus" AS ENUM ('CARREGADO', 'ANALISADO', 'IMPORTADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "ImportRowStatus" AS ENUM ('OK', 'ALERTA', 'DUPLICADO_ARQUIVO', 'JA_EXISTE', 'INCONSISTENTE', 'IMPORTADO', 'IGNORADO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ApplicationStatus" ADD VALUE 'AGUARDANDO_GESTOR';
ALTER TYPE "ApplicationStatus" ADD VALUE 'NAO_COMPARECEU';
ALTER TYPE "ApplicationStatus" ADD VALUE 'BANCO_TALENTOS';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CandidateSource" ADD VALUE 'INSTAGRAM';
ALTER TYPE "CandidateSource" ADD VALUE 'WHATSAPP';
ALTER TYPE "CandidateSource" ADD VALUE 'SINE';
ALTER TYPE "CandidateSource" ADD VALUE 'PRESENCIAL';
ALTER TYPE "CandidateSource" ADD VALUE 'EX_COLABORADOR';

-- AlterEnum
ALTER TYPE "JobOpeningStatus" ADD VALUE 'ENCERRADA';

-- DropForeignKey
ALTER TABLE "Interview" DROP CONSTRAINT "Interview_interviewerId_fkey";

-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "expectedSalary" DECIMAL(10,2),
ADD COLUMN     "externalCheckNote" TEXT,
ADD COLUMN     "externalCheckStatus" "ExternalCheckStatus" NOT NULL DEFAULT 'NAO_APLICA',
ADD COLUMN     "lastSalary" DECIMAL(10,2),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "offeredSalary" DECIMAL(10,2),
ADD COLUMN     "valuedBenefits" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "desiredPositionId" TEXT,
ADD COLUMN     "importBatchId" TEXT,
ADD COLUMN     "nameNormalized" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "phoneNormalized" TEXT;

-- AlterTable
ALTER TABLE "Interview" DROP COLUMN "interviewerId",
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "hasTime" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "interviewerName" TEXT,
ADD COLUMN     "interviewerUserId" TEXT,
ADD COLUMN     "reasonId" TEXT,
ADD COLUMN     "result" "InterviewResult" NOT NULL DEFAULT 'PENDENTE',
ADD COLUMN     "resultAt" TIMESTAMP(3),
ADD COLUMN     "resultById" TEXT,
ADD COLUMN     "resultNote" TEXT,
ADD COLUMN     "stage" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "type" SET DEFAULT 'TRIAGEM_RH',
ALTER COLUMN "durationMin" SET DEFAULT 30;

-- AlterTable
ALTER TABLE "JobOpening" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "expectedSalary" DECIMAL(10,2),
ADD COLUMN     "importBatchId" TEXT,
ADD COLUMN     "isHistorical" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "schedule" "WorkSchedule",
ADD COLUMN     "shift" "WorkShift",
ADD COLUMN     "weeklyHours" INTEGER,
ADD COLUMN     "workHours" TEXT,
ALTER COLUMN "reason" SET DEFAULT 'SUBSTITUICAO',
ALTER COLUMN "status" SET DEFAULT 'ABERTA';

-- AlterTable
ALTER TABLE "Position" ADD COLUMN     "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "defaultDepartmentName" TEXT;

-- CreateTable
CREATE TABLE "RejectionReason" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "requiresNote" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RejectionReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagerReview" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "managerId" TEXT,
    "status" "ManagerDecision" NOT NULL DEFAULT 'PENDENTE',
    "reasonId" TEXT,
    "justification" TEXT,
    "onBehalf" BOOLEAN NOT NULL DEFAULT false,
    "requestedById" TEXT,
    "decidedById" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "ManagerReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateEvent" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "applicationId" TEXT,
    "interviewId" TEXT,
    "type" "CandidateEventType" NOT NULL,
    "summary" TEXT NOT NULL,
    "details" JSONB,
    "actorUserId" TEXT,
    "actorName" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "sheetName" TEXT,
    "status" "ImportBatchStatus" NOT NULL DEFAULT 'CARREGADO',
    "headers" JSONB NOT NULL,
    "columnMap" JSONB,
    "valueMap" JSONB,
    "summary" JSONB,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "ignoredRows" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" TIMESTAMP(3),

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRow" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "raw" JSONB NOT NULL,
    "normalized" JSONB,
    "status" "ImportRowStatus" NOT NULL DEFAULT 'OK',
    "issues" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "decision" TEXT,
    "ignoreReason" TEXT,
    "candidateId" TEXT,

    CONSTRAINT "ImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RejectionReason_code_key" ON "RejectionReason"("code");

-- CreateIndex
CREATE INDEX "ManagerReview_managerId_status_idx" ON "ManagerReview"("managerId", "status");

-- CreateIndex
CREATE INDEX "ManagerReview_applicationId_idx" ON "ManagerReview"("applicationId");

-- CreateIndex
CREATE INDEX "CandidateEvent_candidateId_occurredAt_idx" ON "CandidateEvent"("candidateId", "occurredAt");

-- CreateIndex
CREATE INDEX "ImportRow_batchId_status_idx" ON "ImportRow"("batchId", "status");

-- CreateIndex
CREATE INDEX "Candidate_nameNormalized_idx" ON "Candidate"("nameNormalized");

-- CreateIndex
CREATE INDEX "Candidate_phoneNormalized_idx" ON "Candidate"("phoneNormalized");

-- CreateIndex
CREATE INDEX "Interview_result_idx" ON "Interview"("result");

-- CreateIndex
CREATE INDEX "JobOpening_departmentId_idx" ON "JobOpening"("departmentId");

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_desiredPositionId_fkey" FOREIGN KEY ("desiredPositionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_interviewerUserId_fkey" FOREIGN KEY ("interviewerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_reasonId_fkey" FOREIGN KEY ("reasonId") REFERENCES "RejectionReason"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_resultById_fkey" FOREIGN KEY ("resultById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerReview" ADD CONSTRAINT "ManagerReview_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerReview" ADD CONSTRAINT "ManagerReview_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Manager"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerReview" ADD CONSTRAINT "ManagerReview_reasonId_fkey" FOREIGN KEY ("reasonId") REFERENCES "RejectionReason"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerReview" ADD CONSTRAINT "ManagerReview_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerReview" ADD CONSTRAINT "ManagerReview_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateEvent" ADD CONSTRAINT "CandidateEvent_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateEvent" ADD CONSTRAINT "CandidateEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateEvent" ADD CONSTRAINT "CandidateEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ═══ Regras adicionais (Fase 2) ═══

-- Numeração automática das vagas (VAG-AAAA-NNNN), sem colisão em acessos simultâneos
CREATE SEQUENCE IF NOT EXISTS job_opening_code_seq START 1;

-- Histórico do candidato é somente-inserção (mesma regra da auditoria)
CREATE TRIGGER candidate_event_immutable
  BEFORE UPDATE OR DELETE ON "CandidateEvent"
  FOR EACH ROW EXECUTE FUNCTION riale_block_mutation();

-- Integridade de valores
ALTER TABLE "JobOpening" ADD CONSTRAINT job_opening_salary_chk CHECK ("expectedSalary" IS NULL OR "expectedSalary" >= 0);
ALTER TABLE "JobOpening" ADD CONSTRAINT job_opening_hours_chk CHECK ("weeklyHours" IS NULL OR ("weeklyHours" BETWEEN 1 AND 60));
ALTER TABLE "Application" ADD CONSTRAINT application_salary_chk CHECK (
  ("offeredSalary" IS NULL OR "offeredSalary" >= 0) AND ("expectedSalary" IS NULL OR "expectedSalary" >= 0) AND ("lastSalary" IS NULL OR "lastSalary" >= 0));
ALTER TABLE "Interview" ADD CONSTRAINT interview_duration_chk CHECK ("durationMin" BETWEEN 5 AND 480);
-- Reprovação exige motivo (registros novos e importados)
ALTER TABLE "Interview" ADD CONSTRAINT interview_rejection_reason_chk CHECK ("result" <> 'REPROVADO' OR "reasonId" IS NOT NULL);
-- Reprovação pelo gestor exige justificativa
ALTER TABLE "ManagerReview" ADD CONSTRAINT manager_review_justification_chk CHECK ("status" <> 'REPROVADO' OR length(coalesce("justification", '')) > 0);
