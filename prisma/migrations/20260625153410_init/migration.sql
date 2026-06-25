-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'RH_CORPORATIVO', 'RH_UNIDADE', 'GESTOR', 'COLABORADOR', 'DIRETORIA_READONLY');

-- CreateEnum
CREATE TYPE "CareerLevel" AS ENUM ('N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7');

-- CreateEnum
CREATE TYPE "RequirementType" AS ENUM ('TRAINING', 'COMPETENCY', 'METRIC', 'DISCIPLINARY', 'OTHER');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('PRE_ADMISSAO', 'EM_ONBOARDING', 'ATIVO', 'PERIODO_ESTENDIDO', 'DESVINCULADO');

-- CreateEnum
CREATE TYPE "OnboardingPeriod" AS ENUM ('PERIODO_1', 'PERIODO_2');

-- CreateEnum
CREATE TYPE "ChecklistItemType" AS ENUM ('DOCUMENT_SIGNATURE', 'TRAINING', 'MEETING', 'EVALUATION', 'TASK', 'SURVEY');

-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('ATIVO', 'CONCLUIDO', 'ENCERRADO_PERIODO_EXPERIENCIA', 'ESTENDIDO');

-- CreateEnum
CREATE TYPE "StageStatus" AS ENUM ('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'ATRASADA', 'REABERTA');

-- CreateEnum
CREATE TYPE "ChecklistOrigin" AS ENUM ('ONBOARDING', 'CAREER_TRACK', 'PDI', 'PDL');

-- CreateEnum
CREATE TYPE "ChecklistStatus" AS ENUM ('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDO', 'ATRASADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'CRITICA');

-- CreateEnum
CREATE TYPE "EvaluationMilestone" AS ENUM ('D45', 'D90', 'CICLO_SEMESTRAL', 'PDL_360');

-- CreateEnum
CREATE TYPE "PDIOrigin" AS ENUM ('AVALIACAO_ONBOARDING', 'AVALIACAO_EXPERIENCIA', 'FEEDBACK_GESTOR', 'PLANO_CARREIRA', 'GAP_RH', 'SOLIDES_IMPORT', 'PDL');

-- CreateEnum
CREATE TYPE "PDIStatus" AS ENUM ('ABERTO', 'EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "PDLStage" AS ENUM ('DIAGNOSTICO', 'FORMACAO', 'IMERSAO', 'AVALIACAO_FINAL', 'TRANSICAO');

-- CreateEnum
CREATE TYPE "PDLStatus" AS ENUM ('CANDIDATO', 'EM_ANDAMENTO', 'CONCLUIDO', 'REPROVADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'APPROVE', 'REJECT', 'REOPEN', 'LOGIN', 'EXPORT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "unitId" TEXT,
    "employeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerTrack" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CareerTrack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "level" "CareerLevel" NOT NULL,
    "departmentId" TEXT NOT NULL,
    "careerTrackId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerStage" (
    "id" TEXT NOT NULL,
    "careerTrackId" TEXT NOT NULL,
    "level" "CareerLevel" NOT NULL,
    "typicalMonths" TEXT,
    "masteryCriteria" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "CareerStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageRequirement" (
    "id" TEXT NOT NULL,
    "careerStageId" TEXT NOT NULL,
    "type" "RequirementType" NOT NULL,
    "description" TEXT NOT NULL,
    "targetValue" TEXT,

    CONSTRAINT "StageRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionScore" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "cycle" TEXT NOT NULL,
    "performance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "competency" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "behavior" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "culturalFit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "leadershipPotential" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pdiCompletion" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "conduct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "committeeRequired" BOOLEAN NOT NULL DEFAULT false,
    "committeeMinutes" TEXT,
    "decision" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromotionScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "managerId" TEXT,
    "buddyId" TEXT,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'PRE_ADMISSAO',
    "admissionDate" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuddyEligibility" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "lastEvaluation" DOUBLE PRECISION NOT NULL,
    "monthsOfTenure" INTEGER NOT NULL,
    "disciplinaryFree" BOOLEAN NOT NULL,
    "voluntaryOptIn" BOOLEAN NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "BuddyEligibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "positionId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" TEXT NOT NULL DEFAULT 'v01/2026',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnboardingTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingStageTemplate" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "period" "OnboardingPeriod" NOT NULL,
    "name" TEXT NOT NULL,
    "dayRangeStart" INTEGER NOT NULL,
    "dayRangeEnd" INTEGER NOT NULL,
    "ownerRole" "Role" NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "OnboardingStageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistItemTemplate" (
    "id" TEXT NOT NULL,
    "stageTemplateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "ChecklistItemType" NOT NULL,
    "dueDayOffset" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "ChecklistItemTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingProcess" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "status" "OnboardingStatus" NOT NULL DEFAULT 'ATIVO',
    "extendedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingProcess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingStage" (
    "id" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "period" "OnboardingPeriod" NOT NULL,
    "dueDate" TIMESTAMP(3),
    "completedDate" TIMESTAMP(3),
    "status" "StageStatus" NOT NULL DEFAULT 'PENDENTE',
    "responsibleId" TEXT,
    "reopenedReason" TEXT,
    "order" INTEGER NOT NULL,

    CONSTRAINT "OnboardingStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "ChecklistItemType" NOT NULL,
    "origin" "ChecklistOrigin" NOT NULL,
    "employeeId" TEXT NOT NULL,
    "onboardingStageId" TEXT,
    "pdiId" TEXT,
    "responsibleId" TEXT,
    "dueDate" TIMESTAMP(3),
    "completedDate" TIMESTAMP(3),
    "status" "ChecklistStatus" NOT NULL DEFAULT 'PENDENTE',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIA',
    "observation" TEXT,
    "justification" TEXT,
    "evidenceUrl" TEXT,
    "completedById" TEXT,
    "validatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evaluation" (
    "id" TEXT NOT NULL,
    "processId" TEXT,
    "employeeId" TEXT NOT NULL,
    "milestone" "EvaluationMilestone" NOT NULL,
    "goalsScore" DOUBLE PRECISION,
    "technicalScore" DOUBLE PRECISION,
    "popsScore" DOUBLE PRECISION,
    "attendanceScore" DOUBLE PRECISION,
    "teamworkScore" DOUBLE PRECISION,
    "finalScore" DOUBLE PRECISION,
    "belowAlertThreshold" BOOLEAN NOT NULL DEFAULT false,
    "evaluatorId" TEXT NOT NULL,
    "outcome" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WellbeingCheck" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "dayOffset" INTEGER NOT NULL,
    "q1Support" INTEGER,
    "q2Clarity" INTEGER,
    "q3Future" TEXT,
    "alertTriggered" BOOLEAN NOT NULL DEFAULT false,
    "alertResolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WellbeingCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PDI" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "onboardingProcessId" TEXT,
    "origin" "PDIOrigin" NOT NULL,
    "gapDescription" TEXT NOT NULL,
    "developmentGoal" TEXT NOT NULL,
    "recommendedAction" TEXT NOT NULL,
    "executorId" TEXT,
    "monitorId" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" "PDIStatus" NOT NULL DEFAULT 'ABERTO',
    "evidenceUrl" TEXT,
    "checkpointNotes" TEXT,
    "finalOpinion" TEXT,
    "completionPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PDI_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PDLCandidacy" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "targetPositionId" TEXT,
    "stage" "PDLStage" NOT NULL DEFAULT 'DIAGNOSTICO',
    "status" "PDLStatus" NOT NULL DEFAULT 'CANDIDATO',
    "evaluationLast2Cycles" DOUBLE PRECISION,
    "tenureMonths" INTEGER,
    "disciplinaryFree12m" BOOLEAN,
    "pdiCompletionLastCycle" DOUBLE PRECISION,
    "managerJustification" TEXT,
    "voluntaryOptIn" BOOLEAN NOT NULL DEFAULT false,
    "evaluation360Score" DOUBLE PRECISION,
    "committeeDecision" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "PDLCandidacy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorRole" "Role" NOT NULL,
    "impactedEmployeeId" TEXT,
    "previousValue" JSONB,
    "newValue" JSONB,
    "justification" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeId_key" ON "User"("employeeId");

-- CreateIndex
CREATE INDEX "User_unitId_idx" ON "User"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_name_key" ON "Unit"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_code_key" ON "Unit"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Department_unitId_name_key" ON "Department"("unitId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CareerTrack_name_key" ON "CareerTrack"("name");

-- CreateIndex
CREATE INDEX "Position_departmentId_idx" ON "Position"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "CareerStage_careerTrackId_level_key" ON "CareerStage"("careerTrackId", "level");

-- CreateIndex
CREATE INDEX "PromotionScore_employeeId_idx" ON "PromotionScore"("employeeId");

-- CreateIndex
CREATE INDEX "Employee_unitId_idx" ON "Employee"("unitId");

-- CreateIndex
CREATE INDEX "Employee_departmentId_idx" ON "Employee"("departmentId");

-- CreateIndex
CREATE INDEX "Employee_managerId_idx" ON "Employee"("managerId");

-- CreateIndex
CREATE UNIQUE INDEX "BuddyEligibility_employeeId_key" ON "BuddyEligibility"("employeeId");

-- CreateIndex
CREATE INDEX "OnboardingProcess_employeeId_idx" ON "OnboardingProcess"("employeeId");

-- CreateIndex
CREATE INDEX "OnboardingStage_processId_idx" ON "OnboardingStage"("processId");

-- CreateIndex
CREATE INDEX "ChecklistItem_employeeId_idx" ON "ChecklistItem"("employeeId");

-- CreateIndex
CREATE INDEX "ChecklistItem_status_idx" ON "ChecklistItem"("status");

-- CreateIndex
CREATE INDEX "Evaluation_employeeId_idx" ON "Evaluation"("employeeId");

-- CreateIndex
CREATE INDEX "WellbeingCheck_employeeId_idx" ON "WellbeingCheck"("employeeId");

-- CreateIndex
CREATE INDEX "PDI_employeeId_idx" ON "PDI"("employeeId");

-- CreateIndex
CREATE INDEX "PDLCandidacy_employeeId_idx" ON "PDLCandidacy"("employeeId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_impactedEmployeeId_idx" ON "AuditLog"("impactedEmployeeId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_careerTrackId_fkey" FOREIGN KEY ("careerTrackId") REFERENCES "CareerTrack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerStage" ADD CONSTRAINT "CareerStage_careerTrackId_fkey" FOREIGN KEY ("careerTrackId") REFERENCES "CareerTrack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageRequirement" ADD CONSTRAINT "StageRequirement_careerStageId_fkey" FOREIGN KEY ("careerStageId") REFERENCES "CareerStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionScore" ADD CONSTRAINT "PromotionScore_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_buddyId_fkey" FOREIGN KEY ("buddyId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingTemplate" ADD CONSTRAINT "OnboardingTemplate_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingStageTemplate" ADD CONSTRAINT "OnboardingStageTemplate_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "OnboardingTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItemTemplate" ADD CONSTRAINT "ChecklistItemTemplate_stageTemplateId_fkey" FOREIGN KEY ("stageTemplateId") REFERENCES "OnboardingStageTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingProcess" ADD CONSTRAINT "OnboardingProcess_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingProcess" ADD CONSTRAINT "OnboardingProcess_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "OnboardingTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingStage" ADD CONSTRAINT "OnboardingStage_processId_fkey" FOREIGN KEY ("processId") REFERENCES "OnboardingProcess"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingStage" ADD CONSTRAINT "OnboardingStage_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_onboardingStageId_fkey" FOREIGN KEY ("onboardingStageId") REFERENCES "OnboardingStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_pdiId_fkey" FOREIGN KEY ("pdiId") REFERENCES "PDI"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_processId_fkey" FOREIGN KEY ("processId") REFERENCES "OnboardingProcess"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PDI" ADD CONSTRAINT "PDI_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PDI" ADD CONSTRAINT "PDI_onboardingProcessId_fkey" FOREIGN KEY ("onboardingProcessId") REFERENCES "OnboardingProcess"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PDI" ADD CONSTRAINT "PDI_executorId_fkey" FOREIGN KEY ("executorId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PDI" ADD CONSTRAINT "PDI_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PDLCandidacy" ADD CONSTRAINT "PDLCandidacy_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PDLCandidacy" ADD CONSTRAINT "PDLCandidacy_targetPositionId_fkey" FOREIGN KEY ("targetPositionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_impactedEmployeeId_fkey" FOREIGN KEY ("impactedEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
