-- CreateEnum
CREATE TYPE "PayCategory" AS ENUM ('BASE_PAGO', 'ADICIONAL', 'VARIAVEL', 'PREMIACAO');

-- CreateEnum
CREATE TYPE "BenefitCategory" AS ENUM ('VALE_TRANSPORTE', 'ALIMENTACAO', 'PLANO_SAUDE', 'PLANO_ODONTO', 'TOTALPASS', 'EDUCACAO', 'FARMACIA', 'OUTRO');

-- CreateEnum
CREATE TYPE "BenefitCostType" AS ENUM ('MENSAL', 'POR_DIA', 'SEM_CUSTO');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('NENHUM', 'FIXO', 'PERCENTUAL_SALARIO');

-- CreateEnum
CREATE TYPE "ElogioStatus" AS ENUM ('PENDENTE', 'APROVADO', 'REJEITADO');

-- CreateEnum
CREATE TYPE "PprStatus" AS ENUM ('RASCUNHO', 'APURADO', 'PAGO');

-- CreateEnum
CREATE TYPE "PprDistribution" AS ENUM ('IGUAL', 'PROPORCIONAL_SALARIO');

-- CreateEnum
CREATE TYPE "MarketSource" AS ENUM ('CONCORRENTE', 'ANUNCIO_VAGA', 'PESQUISA_SETORIAL', 'SINDICATO', 'CANDIDATO', 'OUTRO');

-- CreateTable
CREATE TABLE "PositionSalary" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "unitId" TEXT,
    "baseSalary" DECIMAL(10,2) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PositionSalary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeSalary" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeSalary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayItemType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" "PayCategory" NOT NULL,
    "chargeable" BOOLEAN NOT NULL DEFAULT true,
    "system" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,

    CONSTRAINT "PayItemType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayItem" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "competence" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Benefit" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "BenefitCategory" NOT NULL,
    "provider" TEXT,
    "description" TEXT,
    "costType" "BenefitCostType" NOT NULL DEFAULT 'MENSAL',
    "companyCost" DECIMAL(10,2),
    "dependentCost" DECIMAL(10,2),
    "discountType" "DiscountType" NOT NULL DEFAULT 'NENHUM',
    "discountValue" DECIMAL(10,2),
    "allUnits" BOOLEAN NOT NULL DEFAULT true,
    "valueSource" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Benefit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenefitUnit" (
    "id" TEXT NOT NULL,
    "benefitId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "companyCost" DECIMAL(10,2),

    CONSTRAINT "BenefitUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeBenefit" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "benefitId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "companyCost" DECIMAL(10,2),
    "daysPerMonth" INTEGER,
    "dependents" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeBenefit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChargeRate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "ratePct" DECIMAL(7,4),
    "legalRef" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChargeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElogioRule" (
    "id" TEXT NOT NULL,
    "amountPerElogio" DECIMAL(10,2) NOT NULL,
    "maxPerMonth" INTEGER,
    "maxAmountPerMonth" DECIMAL(10,2),
    "sources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ElogioRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Elogio" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "reference" TEXT,
    "description" TEXT,
    "status" "ElogioStatus" NOT NULL DEFAULT 'PENDENTE',
    "rejectReason" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Elogio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PprProgram" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "poolAmount" DECIMAL(14,2),
    "maxAchievementPct" INTEGER NOT NULL DEFAULT 100,
    "minFactorPct" INTEGER NOT NULL DEFAULT 0,
    "distribution" "PprDistribution" NOT NULL DEFAULT 'IGUAL',
    "minMonths" INTEGER NOT NULL DEFAULT 0,
    "prorate" BOOLEAN NOT NULL DEFAULT true,
    "unitId" TEXT,
    "status" "PprStatus" NOT NULL DEFAULT 'RASCUNHO',
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PprProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PprGoal" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weightPct" DECIMAL(6,2) NOT NULL,
    "target" TEXT,
    "achievementPct" DECIMAL(6,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PprGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketSalary" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "hotelCategory" TEXT,
    "region" TEXT,
    "source" "MarketSource" NOT NULL,
    "baseSalary" DECIMAL(10,2),
    "totalComp" DECIMAL(10,2),
    "benefits" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "collectedAt" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketSalary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PositionSalary_positionId_effectiveFrom_idx" ON "PositionSalary"("positionId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "EmployeeSalary_employeeId_effectiveFrom_idx" ON "EmployeeSalary"("employeeId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "PayItemType_code_key" ON "PayItemType"("code");

-- CreateIndex
CREATE INDEX "PayItem_employeeId_competence_idx" ON "PayItem"("employeeId", "competence");

-- CreateIndex
CREATE INDEX "PayItem_competence_idx" ON "PayItem"("competence");

-- CreateIndex
CREATE UNIQUE INDEX "Benefit_code_key" ON "Benefit"("code");

-- CreateIndex
CREATE UNIQUE INDEX "BenefitUnit_benefitId_unitId_key" ON "BenefitUnit"("benefitId", "unitId");

-- CreateIndex
CREATE INDEX "EmployeeBenefit_employeeId_idx" ON "EmployeeBenefit"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeBenefit_benefitId_idx" ON "EmployeeBenefit"("benefitId");

-- CreateIndex
CREATE UNIQUE INDEX "ChargeRate_code_key" ON "ChargeRate"("code");

-- CreateIndex
CREATE INDEX "Elogio_employeeId_date_idx" ON "Elogio"("employeeId", "date");

-- CreateIndex
CREATE INDEX "MarketSalary_positionId_idx" ON "MarketSalary"("positionId");

-- AddForeignKey
ALTER TABLE "PositionSalary" ADD CONSTRAINT "PositionSalary_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionSalary" ADD CONSTRAINT "PositionSalary_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSalary" ADD CONSTRAINT "EmployeeSalary_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayItem" ADD CONSTRAINT "PayItem_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayItem" ADD CONSTRAINT "PayItem_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "PayItemType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitUnit" ADD CONSTRAINT "BenefitUnit_benefitId_fkey" FOREIGN KEY ("benefitId") REFERENCES "Benefit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitUnit" ADD CONSTRAINT "BenefitUnit_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeBenefit" ADD CONSTRAINT "EmployeeBenefit_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeBenefit" ADD CONSTRAINT "EmployeeBenefit_benefitId_fkey" FOREIGN KEY ("benefitId") REFERENCES "Benefit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Elogio" ADD CONSTRAINT "Elogio_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PprGoal" ADD CONSTRAINT "PprGoal_programId_fkey" FOREIGN KEY ("programId") REFERENCES "PprProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketSalary" ADD CONSTRAINT "MarketSalary_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ── Regras no banco (Fase 6) ──
ALTER TABLE "PositionSalary" ADD CONSTRAINT position_salary_chk CHECK ("baseSalary" > 0);
ALTER TABLE "EmployeeSalary" ADD CONSTRAINT employee_salary_chk CHECK ("amount" > 0);
ALTER TABLE "PayItem" ADD CONSTRAINT pay_item_competence_chk CHECK ("competence" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
ALTER TABLE "Benefit" ADD CONSTRAINT benefit_values_chk CHECK (("companyCost" IS NULL OR "companyCost" >= 0) AND ("dependentCost" IS NULL OR "dependentCost" >= 0) AND ("discountValue" IS NULL OR "discountValue" >= 0) AND ("discountType" <> 'PERCENTUAL_SALARIO' OR "discountValue" IS NULL OR "discountValue" <= 100));
ALTER TABLE "ChargeRate" ADD CONSTRAINT charge_rate_chk CHECK ("ratePct" IS NULL OR ("ratePct" >= 0 AND "ratePct" <= 100));
ALTER TABLE "ElogioRule" ADD CONSTRAINT elogio_rule_chk CHECK ("amountPerElogio" > 0 AND ("maxPerMonth" IS NULL OR "maxPerMonth" > 0));
ALTER TABLE "PprProgram" ADD CONSTRAINT ppr_period_chk CHECK ("periodEnd" >= "periodStart" AND ("poolAmount" IS NULL OR "poolAmount" >= 0));
ALTER TABLE "PprGoal" ADD CONSTRAINT ppr_goal_chk CHECK ("weightPct" > 0 AND "weightPct" <= 100 AND ("achievementPct" IS NULL OR ("achievementPct" >= 0 AND "achievementPct" <= 1000)));
ALTER TABLE "MarketSalary" ADD CONSTRAINT market_salary_chk CHECK (("baseSalary" IS NOT NULL OR "totalComp" IS NOT NULL) AND ("baseSalary" IS NULL OR "baseSalary" > 0) AND ("totalComp" IS NULL OR "totalComp" > 0));
-- histórico salarial é somente inserção
CREATE TRIGGER employee_salary_immutable BEFORE UPDATE OR DELETE ON "EmployeeSalary" FOR EACH ROW EXECUTE FUNCTION riale_block_mutation();
