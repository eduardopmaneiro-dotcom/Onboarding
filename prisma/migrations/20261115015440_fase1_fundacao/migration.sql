-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'RH', 'GESTOR');

-- CreateEnum
CREATE TYPE "CareerLevel" AS ENUM ('N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7');

-- CreateEnum
CREATE TYPE "RequirementType" AS ENUM ('TRAINING', 'COMPETENCY', 'METRIC', 'DISCIPLINARY', 'OTHER');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('PRE_ADMISSAO', 'EM_ONBOARDING', 'ATIVO', 'PERIODO_ESTENDIDO', 'AFASTADO', 'DESLIGADO');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('CLT', 'PJ', 'ESTAGIO', 'TEMPORARIO');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('ADMISSAO', 'PROMOCAO', 'TRANSFERENCIA_UNIDADE', 'TRANSFERENCIA_DEPARTAMENTO', 'MUDANCA_CARGO', 'ALTERACAO_SALARIAL', 'MUDANCA_GESTOR', 'AFASTAMENTO', 'RETORNO', 'DESLIGAMENTO');

-- CreateEnum
CREATE TYPE "JobOpeningStatus" AS ENUM ('RASCUNHO', 'AGUARDANDO_APROVACAO', 'ABERTA', 'PAUSADA', 'PREENCHIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "JobOpeningReason" AS ENUM ('AUMENTO_QUADRO', 'SUBSTITUICAO', 'TEMPORARIA');

-- CreateEnum
CREATE TYPE "CandidateSource" AS ENUM ('INDICACAO', 'SITE', 'LINKEDIN', 'INDEED', 'AGENCIA', 'BANCO_TALENTOS', 'OUTRO');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('TRIAGEM', 'ENTREVISTA', 'AVALIACAO', 'PROPOSTA', 'APROVADO', 'REPROVADO', 'DESISTENTE', 'CONTRATADO');

-- CreateEnum
CREATE TYPE "InterviewType" AS ENUM ('TRIAGEM_RH', 'TECNICA', 'GESTOR', 'FINAL');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('AGENDADA', 'REALIZADA', 'CANCELADA', 'NAO_COMPARECEU');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'IN_APP');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDENTE', 'ENVIADA', 'FALHOU', 'LIDA');

-- CreateEnum
CREATE TYPE "DocumentClassification" AS ENUM ('INTERNO', 'CONFIDENCIAL', 'SENSIVEL');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'APPROVE', 'REJECT', 'REOPEN', 'LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'PASSWORD_RESET_REQUEST', 'PASSWORD_RESET', 'PASSWORD_CHANGE', 'PII_ACCESS', 'DOCUMENT_UPLOAD', 'DOCUMENT_DOWNLOAD', 'PERMISSION_CHANGE', 'ACCESS_DENIED', 'EXPORT');

-- CreateEnum
CREATE TYPE "StageOwner" AS ENUM ('RH', 'GESTOR', 'BUDDY');

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

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "cpfHash" TEXT NOT NULL,
    "cpfEnc" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "unitId" TEXT,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "passwordChangedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "role" "Role" NOT NULL,
    "permissionId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("role","permissionId")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "requestIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "city" TEXT,
    "state" CHAR(2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "unitId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

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
    "code" TEXT,
    "level" "CareerLevel" NOT NULL,
    "description" TEXT,
    "careerTrackId" TEXT,
    "isLeadership" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

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
CREATE TABLE "Manager" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "cpfHash" TEXT,
    "cpfEnc" TEXT,
    "internalId" TEXT,
    "positionId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "directSuperiorId" TEXT,
    "userId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Manager_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "internalId" TEXT,
    "cpfHash" TEXT,
    "cpfEnc" TEXT,
    "email" TEXT,
    "contractType" "ContractType" NOT NULL DEFAULT 'CLT',
    "departmentId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "managerId" TEXT,
    "buddyId" TEXT,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'PRE_ADMISSAO',
    "admissionDate" TIMESTAMP(3) NOT NULL,
    "terminationDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovementHistory" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "MovementType" NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "fromPositionId" TEXT,
    "toPositionId" TEXT,
    "fromDepartmentId" TEXT,
    "toDepartmentId" TEXT,
    "fromManagerId" TEXT,
    "toManagerId" TEXT,
    "reason" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovementHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobOpening" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "requestingManagerId" TEXT,
    "reason" "JobOpeningReason" NOT NULL,
    "headcount" INTEGER NOT NULL DEFAULT 1,
    "status" "JobOpeningStatus" NOT NULL DEFAULT 'RASCUNHO',
    "contractType" "ContractType" NOT NULL DEFAULT 'CLT',
    "description" TEXT,
    "requirements" TEXT,
    "openedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "targetDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobOpening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "cpfHash" TEXT,
    "cpfEnc" TEXT,
    "source" "CandidateSource" NOT NULL DEFAULT 'OUTRO',
    "consentAt" TIMESTAMP(3),
    "consentVersion" TEXT,
    "retainUntil" TIMESTAMP(3),
    "anonymizedAt" TIMESTAMP(3),
    "hiredEmployeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "jobOpeningId" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'TRIAGEM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interview" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "type" "InterviewType" NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 45,
    "location" TEXT,
    "interviewerId" TEXT,
    "status" "InterviewStatus" NOT NULL DEFAULT 'AGENDADA',
    "score" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDENTE',
    "recipientUserId" TEXT,
    "recipientEmail" TEXT,
    "template" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "relatedEntity" TEXT,
    "relatedId" TEXT,
    "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "classification" "DocumentClassification" NOT NULL DEFAULT 'CONFIDENCIAL',
    "uploadedById" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "action" "AuditAction" NOT NULL,
    "actorId" TEXT,
    "actorRole" "Role",
    "impactedEmployeeId" TEXT,
    "previousValue" JSONB,
    "newValue" JSONB,
    "justification" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
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
    "owner" "StageOwner" NOT NULL,
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

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_cpfHash_key" ON "User"("cpfHash");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_unitId_idx" ON "User"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_name_key" ON "Unit"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_code_key" ON "Unit"("code");

-- CreateIndex
CREATE INDEX "Department_unitId_idx" ON "Department"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "Department_unitId_name_key" ON "Department"("unitId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CareerTrack_name_key" ON "CareerTrack"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Position_code_key" ON "Position"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Position_title_key" ON "Position"("title");

-- CreateIndex
CREATE UNIQUE INDEX "CareerStage_careerTrackId_level_key" ON "CareerStage"("careerTrackId", "level");

-- CreateIndex
CREATE UNIQUE INDEX "Manager_email_key" ON "Manager"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Manager_cpfHash_key" ON "Manager"("cpfHash");

-- CreateIndex
CREATE UNIQUE INDEX "Manager_internalId_key" ON "Manager"("internalId");

-- CreateIndex
CREATE UNIQUE INDEX "Manager_userId_key" ON "Manager"("userId");

-- CreateIndex
CREATE INDEX "Manager_departmentId_idx" ON "Manager"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_internalId_key" ON "Employee"("internalId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_cpfHash_key" ON "Employee"("cpfHash");

-- CreateIndex
CREATE INDEX "Employee_departmentId_idx" ON "Employee"("departmentId");

-- CreateIndex
CREATE INDEX "Employee_positionId_idx" ON "Employee"("positionId");

-- CreateIndex
CREATE INDEX "Employee_managerId_idx" ON "Employee"("managerId");

-- CreateIndex
CREATE INDEX "Employee_status_idx" ON "Employee"("status");

-- CreateIndex
CREATE INDEX "MovementHistory_employeeId_effectiveDate_idx" ON "MovementHistory"("employeeId", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "JobOpening_code_key" ON "JobOpening"("code");

-- CreateIndex
CREATE INDEX "JobOpening_status_idx" ON "JobOpening"("status");

-- CreateIndex
CREATE INDEX "JobOpening_positionId_idx" ON "JobOpening"("positionId");

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_cpfHash_key" ON "Candidate"("cpfHash");

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_hiredEmployeeId_key" ON "Candidate"("hiredEmployeeId");

-- CreateIndex
CREATE INDEX "Candidate_email_idx" ON "Candidate"("email");

-- CreateIndex
CREATE INDEX "Application_jobOpeningId_status_idx" ON "Application"("jobOpeningId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Application_candidateId_jobOpeningId_key" ON "Application"("candidateId", "jobOpeningId");

-- CreateIndex
CREATE INDEX "Interview_applicationId_idx" ON "Interview"("applicationId");

-- CreateIndex
CREATE INDEX "Interview_scheduledAt_idx" ON "Interview"("scheduledAt");

-- CreateIndex
CREATE INDEX "Notification_status_scheduledFor_idx" ON "Notification"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "Notification_recipientUserId_idx" ON "Notification"("recipientUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Document_storageKey_key" ON "Document"("storageKey");

-- CreateIndex
CREATE INDEX "Document_ownerType_ownerId_idx" ON "Document"("ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "PromotionScore_employeeId_idx" ON "PromotionScore"("employeeId");

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

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_careerTrackId_fkey" FOREIGN KEY ("careerTrackId") REFERENCES "CareerTrack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerStage" ADD CONSTRAINT "CareerStage_careerTrackId_fkey" FOREIGN KEY ("careerTrackId") REFERENCES "CareerTrack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageRequirement" ADD CONSTRAINT "StageRequirement_careerStageId_fkey" FOREIGN KEY ("careerStageId") REFERENCES "CareerStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Manager" ADD CONSTRAINT "Manager_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Manager" ADD CONSTRAINT "Manager_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Manager" ADD CONSTRAINT "Manager_directSuperiorId_fkey" FOREIGN KEY ("directSuperiorId") REFERENCES "Manager"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Manager" ADD CONSTRAINT "Manager_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Manager"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_buddyId_fkey" FOREIGN KEY ("buddyId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovementHistory" ADD CONSTRAINT "MovementHistory_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovementHistory" ADD CONSTRAINT "MovementHistory_fromPositionId_fkey" FOREIGN KEY ("fromPositionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovementHistory" ADD CONSTRAINT "MovementHistory_toPositionId_fkey" FOREIGN KEY ("toPositionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovementHistory" ADD CONSTRAINT "MovementHistory_fromDepartmentId_fkey" FOREIGN KEY ("fromDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovementHistory" ADD CONSTRAINT "MovementHistory_toDepartmentId_fkey" FOREIGN KEY ("toDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovementHistory" ADD CONSTRAINT "MovementHistory_fromManagerId_fkey" FOREIGN KEY ("fromManagerId") REFERENCES "Manager"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovementHistory" ADD CONSTRAINT "MovementHistory_toManagerId_fkey" FOREIGN KEY ("toManagerId") REFERENCES "Manager"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovementHistory" ADD CONSTRAINT "MovementHistory_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOpening" ADD CONSTRAINT "JobOpening_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOpening" ADD CONSTRAINT "JobOpening_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOpening" ADD CONSTRAINT "JobOpening_requestingManagerId_fkey" FOREIGN KEY ("requestingManagerId") REFERENCES "Manager"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_hiredEmployeeId_fkey" FOREIGN KEY ("hiredEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_jobOpeningId_fkey" FOREIGN KEY ("jobOpeningId") REFERENCES "JobOpening"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_interviewerId_fkey" FOREIGN KEY ("interviewerId") REFERENCES "Manager"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Setting" ADD CONSTRAINT "Setting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_impactedEmployeeId_fkey" FOREIGN KEY ("impactedEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionScore" ADD CONSTRAINT "PromotionScore_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
