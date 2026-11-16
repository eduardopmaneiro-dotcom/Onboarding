-- CreateEnum
CREATE TYPE "EducationLevel" AS ENUM ('NAO_EXIGIDA', 'FUNDAMENTAL_INCOMPLETO', 'FUNDAMENTAL', 'MEDIO_INCOMPLETO', 'MEDIO', 'TECNICO', 'SUPERIOR_INCOMPLETO', 'SUPERIOR', 'POS_GRADUACAO');

-- CreateEnum
CREATE TYPE "DescriptorStatus" AS ENUM ('RASCUNHO', 'VIGENTE', 'ARQUIVADO');

-- CreateEnum
CREATE TYPE "PathStatus" AS ENUM ('RASCUNHO', 'VIGENTE', 'ARQUIVADO');

-- CreateEnum
CREATE TYPE "TalentStatus" AS ENUM ('ATIVO', 'CONTATADO', 'ARQUIVADO');

-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN     "competencies" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "education" "EducationLevel";

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "portalUserId" TEXT;

-- AlterTable
ALTER TABLE "MovementHistory" ADD COLUMN     "jobOpeningId" TEXT;

-- AlterTable
ALTER TABLE "PositionSalary" ADD COLUMN     "maxSalary" DECIMAL(10,2),
ADD COLUMN     "minSalary" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "PromotionScore" ADD COLUMN     "evaluatedById" TEXT;

-- CreateTable
CREATE TABLE "JobDescription" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "DescriptorStatus" NOT NULL DEFAULT 'RASCUNHO',
    "objective" TEXT,
    "responsibilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "minRequirements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "education" "EducationLevel",
    "educationNote" TEXT,
    "minExperienceMonths" INTEGER,
    "experienceNote" TEXT,
    "technicalRequired" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "technicalDevelopable" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "competencies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reportsToId" TEXT,
    "sourceRef" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobDescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerPath" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "familyId" TEXT,
    "status" "PathStatus" NOT NULL DEFAULT 'RASCUNHO',
    "description" TEXT,
    "sourceRef" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareerPath_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerPathStep" (
    "id" TEXT NOT NULL,
    "pathId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "positionId" TEXT NOT NULL,
    "minMonths" INTEGER,
    "minScore" INTEGER,
    "requirements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "developable" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "CareerPathStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateExperience" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "positionId" TEXT,
    "roleTitle" TEXT NOT NULL,
    "company" TEXT,
    "months" INTEGER,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateExperience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalentPoolEntry" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "TalentStatus" NOT NULL DEFAULT 'ATIVO',
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalentPoolEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobDescription_positionId_version_key" ON "JobDescription"("positionId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "CareerPathStep_pathId_order_key" ON "CareerPathStep"("pathId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "CareerPathStep_pathId_positionId_key" ON "CareerPathStep"("pathId", "positionId");

-- CreateIndex
CREATE INDEX "CandidateExperience_candidateId_idx" ON "CandidateExperience"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "TalentPoolEntry_candidateId_positionId_key" ON "TalentPoolEntry"("candidateId", "positionId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_portalUserId_key" ON "Employee"("portalUserId");

-- AddForeignKey
ALTER TABLE "MovementHistory" ADD CONSTRAINT "MovementHistory_jobOpeningId_fkey" FOREIGN KEY ("jobOpeningId") REFERENCES "JobOpening"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobDescription" ADD CONSTRAINT "JobDescription_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobDescription" ADD CONSTRAINT "JobDescription_reportsToId_fkey" FOREIGN KEY ("reportsToId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerPath" ADD CONSTRAINT "CareerPath_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "CareerTrack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerPathStep" ADD CONSTRAINT "CareerPathStep_pathId_fkey" FOREIGN KEY ("pathId") REFERENCES "CareerPath"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerPathStep" ADD CONSTRAINT "CareerPathStep_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateExperience" ADD CONSTRAINT "CandidateExperience_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateExperience" ADD CONSTRAINT "CandidateExperience_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentPoolEntry" ADD CONSTRAINT "TalentPoolEntry_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentPoolEntry" ADD CONSTRAINT "TalentPoolEntry_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ── Regras no banco (Fase 7) ──
ALTER TABLE "PositionSalary" ADD CONSTRAINT position_salary_band_chk CHECK (("minSalary" IS NULL OR "minSalary" <= "baseSalary") AND ("maxSalary" IS NULL OR "maxSalary" >= "baseSalary") AND ("minSalary" IS NULL OR "minSalary" > 0));
-- um descritivo vigente por cargo
CREATE UNIQUE INDEX job_description_current_uniq ON "JobDescription"("positionId") WHERE "status" = 'VIGENTE';
ALTER TABLE "JobDescription" ADD CONSTRAINT job_description_exp_chk CHECK ("minExperienceMonths" IS NULL OR "minExperienceMonths" BETWEEN 0 AND 600);
ALTER TABLE "CareerPathStep" ADD CONSTRAINT career_step_chk CHECK ("order" >= 1 AND ("minMonths" IS NULL OR "minMonths" BETWEEN 0 AND 240) AND ("minScore" IS NULL OR "minScore" BETWEEN 0 AND 100));
ALTER TABLE "CandidateExperience" ADD CONSTRAINT candidate_exp_chk CHECK ("months" IS NULL OR "months" BETWEEN 0 AND 600);
ALTER TABLE "PromotionScore" ADD CONSTRAINT promotion_score_chk CHECK ("totalScore" BETWEEN 0 AND 100);
