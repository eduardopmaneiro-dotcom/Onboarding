-- CreateEnum
CREATE TYPE "EmployeeOrigin" AS ENUM ('RECRUTAMENTO', 'CADASTRO_DIRETO');

-- CreateEnum
CREATE TYPE "TerminationType" AS ENUM ('PEDIDO_DEMISSAO', 'DISPENSA_SEM_JUSTA_CAUSA', 'DISPENSA_JUSTA_CAUSA', 'TERMINO_EXPERIENCIA', 'RESCISAO_ANTECIPADA_EMPRESA', 'RESCISAO_ANTECIPADA_COLABORADOR', 'ACORDO', 'FALECIMENTO', 'OUTRO');

-- CreateEnum
CREATE TYPE "AdmissionStatus" AS ENUM ('EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "AdmissionCancelReason" AS ENUM ('DESISTENCIA_CANDIDATO', 'INAPTO_EXAME', 'DOCUMENTACAO', 'VAGA_CANCELADA', 'OUTRO');

-- CreateEnum
CREATE TYPE "DocumentCondition" AS ENUM ('SEMPRE', 'ESCOLARIDADE_EXIGIDA', 'COM_DEPENDENTES');

-- CreateEnum
CREATE TYPE "AdmissionDocStatus" AS ENUM ('PENDENTE', 'RECEBIDO', 'EM_ANALISE', 'APROVADO', 'RECUSADO');

-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('AGENDADO', 'REALIZADO', 'NAO_COMPARECEU', 'CANCELADO');

-- CreateEnum
CREATE TYPE "ExamResult" AS ENUM ('PENDENTE', 'APTO', 'APTO_COM_RESTRICOES', 'INAPTO');

-- CreateEnum
CREATE TYPE "MilestoneStatus" AS ENUM ('PENDENTE', 'REALIZADO', 'ENCERRADO_DESLIGAMENTO');

-- CreateEnum
CREATE TYPE "MilestoneOutcome" AS ENUM ('SEGUE', 'EFETIVADO', 'DESLIGAMENTO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CandidateEventType" ADD VALUE 'ADMISSAO';
ALTER TYPE "CandidateEventType" ADD VALUE 'CONTRATACAO';

-- DropIndex
DROP INDEX "Employee_cpfHash_key";

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "applicationId" TEXT,
ADD COLUMN     "baseSalary" DECIMAL(10,2),
ADD COLUMN     "candidateId" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "origin" "EmployeeOrigin" NOT NULL DEFAULT 'CADASTRO_DIRETO',
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "probationEndDate" TIMESTAMP(3),
ADD COLUMN     "schedule" "WorkSchedule",
ADD COLUMN     "shift" "WorkShift",
ADD COLUMN     "terminationById" TEXT,
ADD COLUMN     "terminationReason" TEXT,
ADD COLUMN     "terminationType" "TerminationType",
ADD COLUMN     "weeklyHours" INTEGER,
ADD COLUMN     "workHours" TEXT;

-- CreateTable
CREATE TABLE "Admission" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "status" "AdmissionStatus" NOT NULL DEFAULT 'EM_ANDAMENTO',
    "admissionDate" TIMESTAMP(3),
    "positionId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "managerId" TEXT,
    "salary" DECIMAL(10,2),
    "contractType" "ContractType" NOT NULL DEFAULT 'CLT',
    "schedule" "WorkSchedule",
    "shift" "WorkShift",
    "workHours" TEXT,
    "weeklyHours" INTEGER,
    "hasDependents" BOOLEAN NOT NULL DEFAULT false,
    "educationRequired" BOOLEAN NOT NULL DEFAULT false,
    "cancelReason" "AdmissionCancelReason",
    "cancelNote" TEXT,
    "canceledAt" TIMESTAMP(3),
    "employeeId" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Admission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdmissionDocType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "condition" "DocumentCondition" NOT NULL DEFAULT 'SEMPRE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdmissionDocType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdmissionDocument" (
    "id" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "docTypeId" TEXT NOT NULL,
    "status" "AdmissionDocStatus" NOT NULL DEFAULT 'PENDENTE',
    "refusalReason" TEXT,
    "note" TEXT,
    "statusAt" TIMESTAMP(3),
    "statusById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdmissionDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Clinic" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Clinic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalExam" (
    "id" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "ExamStatus" NOT NULL DEFAULT 'AGENDADO',
    "performedAt" TIMESTAMP(3),
    "asoReceivedAt" TIMESTAMP(3),
    "result" "ExamResult" NOT NULL DEFAULT 'PENDENTE',
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicalExam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProbationMilestone" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "status" "MilestoneStatus" NOT NULL DEFAULT 'PENDENTE',
    "outcome" "MilestoneOutcome",
    "notes" TEXT,
    "doneAt" TIMESTAMP(3),
    "doneById" TEXT,
    "alertLeadAt" TIMESTAMP(3),
    "alertDueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProbationMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Admission_code_key" ON "Admission"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Admission_employeeId_key" ON "Admission"("employeeId");

-- CreateIndex
CREATE INDEX "Admission_status_idx" ON "Admission"("status");

-- CreateIndex
CREATE INDEX "Admission_applicationId_idx" ON "Admission"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "AdmissionDocType_code_key" ON "AdmissionDocType"("code");

-- CreateIndex
CREATE UNIQUE INDEX "AdmissionDocument_admissionId_docTypeId_key" ON "AdmissionDocument"("admissionId", "docTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "Clinic_name_key" ON "Clinic"("name");

-- CreateIndex
CREATE INDEX "MedicalExam_admissionId_idx" ON "MedicalExam"("admissionId");

-- CreateIndex
CREATE INDEX "ProbationMilestone_status_dueDate_idx" ON "ProbationMilestone"("status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "ProbationMilestone_employeeId_days_key" ON "ProbationMilestone"("employeeId", "days");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_applicationId_key" ON "Employee"("applicationId");

-- CreateIndex
CREATE INDEX "Employee_cpfHash_idx" ON "Employee"("cpfHash");

-- CreateIndex
CREATE INDEX "Employee_candidateId_idx" ON "Employee"("candidateId");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Manager"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmissionDocument" ADD CONSTRAINT "AdmissionDocument_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmissionDocument" ADD CONSTRAINT "AdmissionDocument_docTypeId_fkey" FOREIGN KEY ("docTypeId") REFERENCES "AdmissionDocType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalExam" ADD CONSTRAINT "MedicalExam_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalExam" ADD CONSTRAINT "MedicalExam_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProbationMilestone" ADD CONSTRAINT "ProbationMilestone_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ── Regras no banco (Fase 5) ──
CREATE SEQUENCE IF NOT EXISTS admission_code_seq;
CREATE SEQUENCE IF NOT EXISTS employee_registration_seq;

-- um vínculo ativo por CPF (readmissão cria novo registro; o desligado fica no histórico)
CREATE UNIQUE INDEX employee_active_cpf_uniq ON "Employee"("cpfHash") WHERE "cpfHash" IS NOT NULL AND "status" <> 'DESLIGADO';
-- no máximo um processo admissional não cancelado por candidatura
CREATE UNIQUE INDEX admission_open_per_application_uniq ON "Admission"("applicationId") WHERE "status" <> 'CANCELADA';

ALTER TABLE "Employee" ADD CONSTRAINT employee_termination_chk CHECK (
  ("status" = 'DESLIGADO' AND "terminationDate" IS NOT NULL AND "terminationType" IS NOT NULL)
  OR ("status" <> 'DESLIGADO' AND "terminationDate" IS NULL)
);
ALTER TABLE "Employee" ADD CONSTRAINT employee_termination_after_admission_chk CHECK ("terminationDate" IS NULL OR "terminationDate" >= "admissionDate");
ALTER TABLE "Employee" ADD CONSTRAINT employee_salary_chk CHECK ("baseSalary" IS NULL OR "baseSalary" > 0);
ALTER TABLE "Admission" ADD CONSTRAINT admission_salary_chk CHECK ("salary" IS NULL OR "salary" > 0);
ALTER TABLE "Admission" ADD CONSTRAINT admission_done_chk CHECK ("status" <> 'CONCLUIDA' OR ("employeeId" IS NOT NULL AND "admissionDate" IS NOT NULL));
ALTER TABLE "ProbationMilestone" ADD CONSTRAINT milestone_days_chk CHECK ("days" BETWEEN 1 AND 365);
ALTER TABLE "ProbationMilestone" ADD CONSTRAINT milestone_done_chk CHECK ("status" <> 'REALIZADO' OR ("outcome" IS NOT NULL AND "doneAt" IS NOT NULL));
ALTER TABLE "MedicalExam" ADD CONSTRAINT exam_aso_chk CHECK ("asoReceivedAt" IS NULL OR "status" = 'REALIZADO');
