import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { assertCan, ForbiddenError, type CurrentUser } from "@/lib/session";
import { dateKey, localToDate, todayKey } from "@/lib/datetime";
import { parseMoney } from "@/lib/text";
import { NotFoundError, ValidationError } from "@/modules/shared/errors";
import { employeeScopeWhere } from "@/modules/people/scope";
import { benefitCost, competenceRange, elogioPremium, isCompetence, monthsWorked, pprDistribute, pprFactor, resolveBase, resolvePositionSalary, totalCompensation, type BenefitDef, type ElogioRuleDef } from "@/modules/compensation/calc";

const N = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const dateStr = z.string({ error: "Data obrigatória" }).regex(/^\d{4}-\d{2}-\d{2}$/, "Use AAAA-MM-DD").refine((v) => new Date(`${v}T12:00:00Z`).toISOString().startsWith(v), "Data inexistente");
const money = (label: string) =>
  z.preprocess((v) => (v === undefined || v === "" ? undefined : typeof v === "number" ? v : parseMoney(v)), z.number({ error: `${label}: informe o valor` }).positive(`${label} deve ser maior que zero`));
const optMoney = (label: string) => z.preprocess((v) => (v === undefined || v === "" ? null : typeof v === "number" ? v : parseMoney(v)), z.number().min(0, `${label} inválido`).nullable());
const bool = z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean());
const competence = z.string({ error: "Competência obrigatória" }).refine(isCompetence, "Use AAAA-MM");

/** Configuração da política de remuneração: Admin ou RH corporativo (vale para todas as unidades). */
export function assertConfig(user: CurrentUser) {
  assertCan(user, "remuneracao.config");
  if (user.role !== "ADMIN" && user.unitId) throw new ForbiddenError("A política de remuneração é corporativa — peça ao RH corporativo");
}

async function scopedEmployee(user: CurrentUser, id: string) {
  const e = await prisma.employee.findFirst({ where: { id, ...employeeScopeWhere(user) }, include: { department: true } });
  if (!e) throw new NotFoundError("Colaborador não encontrado");
  return e;
}

// ═════════ Tabela salarial por cargo ═════════

export async function listPositionTable(user: CurrentUser) {
  assertCan(user, "remuneracao.view");
  return prisma.positionSalary.findMany({ orderBy: [{ position: { title: "asc" } }, { effectiveFrom: "desc" }], include: { position: { select: { title: true } }, unit: { select: { name: true } } } });
}

const positionSalaryInput = z.object({ positionId: z.string({ error: "Escolha o cargo" }).min(1, "Escolha o cargo"), unitId: z.string().optional(), baseSalary: money("Salário de referência"), minSalary: optMoney("Salário mínimo da faixa"), maxSalary: optMoney("Salário máximo da faixa"), effectiveFrom: dateStr, note: z.string().trim().max(200).optional() });

export async function savePositionSalary(user: CurrentUser, raw: unknown) {
  assertConfig(user);
  const d = positionSalaryInput.parse(raw);
  if (d.minSalary !== null && d.minSalary > d.baseSalary) throw new ValidationError("O mínimo da faixa não pode ser maior que a referência", { minSalary: ["Acima da referência"] });
  if (d.maxSalary !== null && d.maxSalary < d.baseSalary) throw new ValidationError("O máximo da faixa não pode ser menor que a referência", { maxSalary: ["Abaixo da referência"] });
  const row = await prisma.positionSalary.create({ data: { positionId: d.positionId, unitId: d.unitId || null, baseSalary: d.baseSalary, minSalary: d.minSalary, maxSalary: d.maxSalary, effectiveFrom: localToDate(d.effectiveFrom), note: d.note ?? null, createdById: user.id } });
  await recordAudit({ entityType: "PositionSalary", entityId: row.id, action: "CREATE", actorId: user.id, actorRole: user.role, newValue: d });
  return row;
}

// ═════════ Salário-base do colaborador ═════════

const salaryInput = z.object({ amount: money("Salário-base"), effectiveFrom: dateStr, reason: z.string({ error: "Informe o motivo" }).trim().min(3, "Informe o motivo (ex.: promoção, dissídio, mérito)").max(200) });

export async function addEmployeeSalary(user: CurrentUser, employeeId: string, raw: unknown) {
  assertCan(user, "remuneracao.manage");
  const e = await scopedEmployee(user, employeeId);
  const d = salaryInput.parse(raw);
  if (d.effectiveFrom < dateKey(e.admissionDate)) throw new ValidationError("A vigência não pode ser anterior à admissão", { effectiveFrom: ["Antes da admissão"] });
  if (e.status === "DESLIGADO") throw new ValidationError("Colaborador desligado");
  const row = await prisma.$transaction(async (tx) => {
    const r = await tx.employeeSalary.create({ data: { employeeId, amount: d.amount, effectiveFrom: localToDate(d.effectiveFrom), reason: d.reason, createdById: user.id } });
    await tx.movementHistory.create({ data: { employeeId, type: "ALTERACAO_SALARIAL", effectiveDate: localToDate(d.effectiveFrom), toPositionId: e.positionId, toDepartmentId: e.departmentId, reason: d.reason, recordedById: user.id } });
    return r;
  });
  await recordAudit({ entityType: "EmployeeSalary", entityId: row.id, action: "CREATE", actorId: user.id, actorRole: user.role, newValue: { employeeId, amount: d.amount, effectiveFrom: d.effectiveFrom, reason: d.reason } });
  return row;
}

// ═════════ Rubricas e lançamentos pagos ═════════

export async function listPayItemTypes(all = false) {
  return prisma.payItemType.findMany({ where: all ? {} : { active: true }, orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { label: "asc" }] });
}

const typeInput = z.object({ id: z.string().optional(), label: z.string().trim().min(3).max(80), category: z.enum(["BASE_PAGO", "ADICIONAL", "VARIAVEL", "PREMIACAO"]), chargeable: bool.default(false), active: bool.default(true) });

export async function savePayItemType(user: CurrentUser, raw: unknown) {
  assertConfig(user);
  const d = typeInput.parse(raw);
  if (d.id) {
    const cur = await prisma.payItemType.findUniqueOrThrow({ where: { id: d.id } });
    if (cur.system) throw new ValidationError("Rubrica de sistema (calculada pelas regras) não pode ser alterada aqui");
    return prisma.payItemType.update({ where: { id: d.id }, data: { label: d.label, category: d.category, chargeable: d.chargeable, active: d.active } });
  }
  const code = d.label.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
  return prisma.payItemType.create({ data: { code: (await prisma.payItemType.findUnique({ where: { code } })) ? `${code}_${Date.now().toString(36).toUpperCase()}` : code, label: d.label, category: d.category, chargeable: d.chargeable, active: d.active } });
}

const payItemInput = z.object({ typeId: z.string({ error: "Escolha a rubrica" }).min(1, "Escolha a rubrica"), competence, amount: money("Valor"), description: z.string().trim().max(200).optional() });

/** Valor efetivamente pago na competência (dentro do vínculo). Elogio Premiado e PPR são calculados, não lançados. */
export async function addPayItem(user: CurrentUser, employeeId: string, raw: unknown) {
  assertCan(user, "remuneracao.manage");
  const e = await scopedEmployee(user, employeeId);
  const d = payItemInput.parse(raw);
  const type = await prisma.payItemType.findUnique({ where: { id: d.typeId } });
  if (!type || !type.active) throw new ValidationError("Rubrica inválida", { typeId: ["Rubrica inativa"] });
  if (type.system) throw new ValidationError(`${type.label} é calculado pelas regras cadastradas — não é lançado manualmente`, { typeId: ["Rubrica calculada"] });
  const { from, last } = competenceRange(d.competence);
  if (last < dateKey(e.admissionDate) || (e.terminationDate && from > dateKey(e.terminationDate))) throw new ValidationError("Competência fora do vínculo do colaborador", { competence: ["Fora do vínculo"] });
  if (from > todayKey()) throw new ValidationError("Competência futura — registre valores efetivamente pagos", { competence: ["Competência futura"] });
  if (type.category === "BASE_PAGO" && (await prisma.payItem.findFirst({ where: { employeeId, competence: d.competence, type: { category: "BASE_PAGO" } } })))
    throw new ValidationError("Salário pago desta competência já lançado — exclua o anterior para corrigir", { typeId: ["Duplicado"] });
  const row = await prisma.payItem.create({ data: { employeeId, typeId: type.id, competence: d.competence, amount: d.amount, description: d.description ?? null, createdById: user.id } });
  await recordAudit({ entityType: "PayItem", entityId: row.id, action: "CREATE", actorId: user.id, actorRole: user.role, newValue: { employeeId, type: type.code, competence: d.competence, amount: d.amount } });
  return row;
}

export async function deletePayItem(user: CurrentUser, id: string) {
  assertCan(user, "remuneracao.manage");
  const item = await prisma.payItem.findFirst({ where: { id, employee: employeeScopeWhere(user) } });
  if (!item) throw new NotFoundError("Lançamento não encontrado");
  await prisma.payItem.delete({ where: { id } });
  await recordAudit({ entityType: "PayItem", entityId: id, action: "DELETE", actorId: user.id, actorRole: user.role, previousValue: { employeeId: item.employeeId, competence: item.competence, amount: Number(item.amount) } });
}

// ═════════ Benefícios ═════════

export async function listBenefits(all = true) {
  return prisma.benefit.findMany({ where: all ? {} : { active: true }, orderBy: [{ category: "asc" }, { name: "asc" }], include: { units: { include: { unit: { select: { id: true, name: true } } } }, _count: { select: { enrollments: { where: { endDate: null } } } } } });
}

const benefitInput = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2).max(80),
  category: z.enum(["VALE_TRANSPORTE", "ALIMENTACAO", "PLANO_SAUDE", "PLANO_ODONTO", "TOTALPASS", "EDUCACAO", "FARMACIA", "OUTRO"]),
  provider: z.string().trim().max(80).optional(),
  description: z.string().trim().max(300).optional(),
  costType: z.enum(["MENSAL", "POR_DIA", "SEM_CUSTO"]),
  companyCost: optMoney("Custo"),
  dependentCost: optMoney("Custo por dependente"),
  discountType: z.enum(["NENHUM", "FIXO", "PERCENTUAL_SALARIO"]),
  discountValue: optMoney("Desconto"),
  allUnits: bool.default(true),
  unitIds: z.array(z.string()).default([]),
  valueSource: z.string().trim().max(120).optional(),
  active: bool.default(true),
});

/** Benefício institucional. Valores vêm da empresa; com valor informado, a origem é obrigatória. */
export async function saveBenefit(user: CurrentUser, raw: unknown) {
  assertConfig(user);
  const d = benefitInput.parse(raw);
  if (d.discountType === "PERCENTUAL_SALARIO" && d.discountValue !== null && d.discountValue > 100) throw new ValidationError("Percentual acima de 100%", { discountValue: ["Máximo 100%"] });
  if ((d.companyCost !== null || d.dependentCost !== null || d.discountValue !== null) && !d.valueSource) throw new ValidationError("Informe a origem dos valores (documento, contrato ou tabela da empresa)", { valueSource: ["Obrigatório quando há valor"] });
  if (!d.allUnits && !d.unitIds.length) throw new ValidationError("Escolha as unidades em que o benefício existe", { unitIds: ["Escolha ao menos uma"] });
  const data = { name: d.name, category: d.category, provider: d.provider ?? null, description: d.description ?? null, costType: d.costType, companyCost: d.costType === "SEM_CUSTO" ? null : d.companyCost, dependentCost: d.dependentCost, discountType: d.discountType, discountValue: d.discountType === "NENHUM" ? null : d.discountValue, allUnits: d.allUnits, valueSource: d.valueSource ?? null, active: d.active, updatedById: user.id };
  const saved = await prisma.$transaction(async (tx) => {
    const b = d.id ? await tx.benefit.update({ where: { id: d.id }, data }) : await tx.benefit.create({ data: { ...data, code: `${d.category}_${Date.now().toString(36).toUpperCase()}` } });
    const keep = d.allUnits ? [] : d.unitIds;
    await tx.benefitUnit.deleteMany({ where: { benefitId: b.id, unitId: { notIn: keep } } });
    for (const u of keep) await tx.benefitUnit.upsert({ where: { benefitId_unitId: { benefitId: b.id, unitId: u } }, update: {}, create: { benefitId: b.id, unitId: u } });
    return b;
  });
  await recordAudit({ entityType: "Benefit", entityId: saved.id, action: d.id ? "UPDATE" : "CREATE", actorId: user.id, actorRole: user.role, newValue: { ...data, unitIds: d.unitIds } });
  return saved;
}

export async function saveBenefitUnitCost(user: CurrentUser, raw: unknown) {
  assertConfig(user);
  const d = z.object({ benefitId: z.string(), unitId: z.string(), companyCost: optMoney("Custo") }).parse(raw);
  await prisma.benefitUnit.upsert({ where: { benefitId_unitId: { benefitId: d.benefitId, unitId: d.unitId } }, update: { companyCost: d.companyCost }, create: { benefitId: d.benefitId, unitId: d.unitId, companyCost: d.companyCost } });
  await recordAudit({ entityType: "BenefitUnit", entityId: `${d.benefitId}:${d.unitId}`, action: "UPDATE", actorId: user.id, actorRole: user.role, newValue: d });
}

const enrollInput = z.object({ benefitId: z.string({ error: "Escolha o benefício" }).min(1, "Escolha o benefício"), startDate: dateStr, companyCost: optMoney("Valor individual"), daysPerMonth: z.preprocess((v) => (v === undefined || v === "" ? null : Number(v)), z.number().int().min(1).max(31).nullable()), dependents: z.coerce.number().int().min(0).max(20).default(0), note: z.string().trim().max(200).optional() });

export async function enrollBenefit(user: CurrentUser, employeeId: string, raw: unknown) {
  assertCan(user, "remuneracao.manage");
  const e = await scopedEmployee(user, employeeId);
  const d = enrollInput.parse(raw);
  const b = await prisma.benefit.findFirst({ where: { id: d.benefitId, active: true }, include: { units: true } });
  if (!b) throw new ValidationError("Benefício inválido", { benefitId: ["Inativo"] });
  if (!b.allUnits && !b.units.some((u) => u.unitId === e.department.unitId)) throw new ValidationError(`${b.name} não é oferecido na unidade do colaborador`, { benefitId: ["Indisponível na unidade"] });
  if (d.startDate < dateKey(e.admissionDate)) throw new ValidationError("Início anterior à admissão", { startDate: ["Antes da admissão"] });
  if (await prisma.employeeBenefit.findFirst({ where: { employeeId, benefitId: b.id, endDate: null } })) throw new ValidationError("Colaborador já tem este benefício ativo", { benefitId: ["Já ativo"] });
  if (b.costType === "POR_DIA" && !d.daysPerMonth) throw new ValidationError("Informe os dias por mês (benefício pago por dia)", { daysPerMonth: ["Obrigatório"] });
  const row = await prisma.employeeBenefit.create({ data: { employeeId, benefitId: b.id, startDate: localToDate(d.startDate), companyCost: d.companyCost, daysPerMonth: d.daysPerMonth, dependents: d.dependents, note: d.note ?? null, createdById: user.id } });
  await recordAudit({ entityType: "EmployeeBenefit", entityId: row.id, action: "CREATE", actorId: user.id, actorRole: user.role, newValue: { employeeId, benefit: b.code, ...d } });
  return row;
}

export async function endBenefit(user: CurrentUser, enrollmentId: string, raw: unknown) {
  assertCan(user, "remuneracao.manage");
  const en = await prisma.employeeBenefit.findFirst({ where: { id: enrollmentId, employee: employeeScopeWhere(user) } });
  if (!en) throw new NotFoundError("Adesão não encontrada");
  const { endDate } = z.object({ endDate: dateStr }).parse(raw);
  if (endDate < dateKey(en.startDate)) throw new ValidationError("Fim anterior ao início", { endDate: ["Antes do início"] });
  await prisma.employeeBenefit.update({ where: { id: en.id }, data: { endDate: localToDate(endDate) } });
  await recordAudit({ entityType: "EmployeeBenefit", entityId: en.id, action: "UPDATE", actorId: user.id, actorRole: user.role, newValue: { endDate } });
}

// ═════════ Encargos ═════════

export async function listRates() {
  return prisma.chargeRate.findMany({ orderBy: [{ sortOrder: "asc" }, { label: "asc" }], include: { units: { include: { unit: { select: { name: true } } } } } });
}

/** Alíquota específica da unidade (vazio remove e volta a valer a geral). */
export async function saveRateUnit(user: CurrentUser, raw: unknown) {
  assertConfig(user);
  const d = z.object({ rateId: z.string(), unitId: z.string(), ratePct: z.preprocess((v) => (v === undefined || v === "" ? null : Number(String(v).replace(",", "."))), z.number().min(0).max(100).nullable()) }).parse(raw);
  if (d.ratePct === null) await prisma.chargeRateUnit.deleteMany({ where: { rateId: d.rateId, unitId: d.unitId } });
  else await prisma.chargeRateUnit.upsert({ where: { rateId_unitId: { rateId: d.rateId, unitId: d.unitId } }, update: { ratePct: d.ratePct }, create: { rateId: d.rateId, unitId: d.unitId, ratePct: d.ratePct } });
  await recordAudit({ entityType: "ChargeRateUnit", entityId: `${d.rateId}:${d.unitId}`, action: "UPDATE", actorId: user.id, actorRole: user.role, newValue: d });
}
const pctOrNull = z.preprocess((v) => (v === undefined || v === "" ? null : Number(String(v).replace(",", "."))), z.number().min(0).max(100).nullable());
const rateInput = z.object({ id: z.string().optional(), label: z.string().trim().min(2).max(80), ratePct: pctOrNull, apprenticeRatePct: pctOrNull.optional(), legalRef: z.string().trim().max(200).optional(), active: bool.default(true) });
export async function saveRate(user: CurrentUser, raw: unknown) {
  assertConfig(user);
  const d = rateInput.parse(raw);
  const data = { label: d.label, ratePct: d.ratePct, ...(d.apprenticeRatePct !== undefined ? { apprenticeRatePct: d.apprenticeRatePct } : {}), legalRef: d.legalRef ?? null, active: d.active, updatedById: user.id };
  const saved = d.id ? await prisma.chargeRate.update({ where: { id: d.id }, data }) : await prisma.chargeRate.create({ data: { ...data, code: `ENC_${Date.now().toString(36).toUpperCase()}` } });
  await recordAudit({ entityType: "ChargeRate", entityId: saved.id, action: d.id ? "UPDATE" : "CREATE", actorId: user.id, actorRole: user.role, newValue: data });
  return saved;
}

// ═════════ Elogio Premiado ═════════

const ruleInput = z.object({ amountPerElogio: money("Valor por elogio"), maxPerMonth: z.preprocess((v) => (v === undefined || v === "" ? null : Number(v)), z.number().int().positive().nullable()), maxAmountPerMonth: optMoney("Teto mensal"), sources: z.string().optional(), effectiveFrom: dateStr, notes: z.string().trim().max(500).optional() });

export async function saveElogioRule(user: CurrentUser, raw: unknown) {
  assertConfig(user);
  const d = ruleInput.parse(raw);
  const sources = (d.sources ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const row = await prisma.elogioRule.create({ data: { amountPerElogio: d.amountPerElogio, maxPerMonth: d.maxPerMonth, maxAmountPerMonth: d.maxAmountPerMonth, sources, effectiveFrom: localToDate(d.effectiveFrom), notes: d.notes ?? null, createdById: user.id } });
  await recordAudit({ entityType: "ElogioRule", entityId: row.id, action: "CREATE", actorId: user.id, actorRole: user.role, newValue: { ...d, sources } });
  return row;
}

export async function ruleAt(at: string): Promise<(ElogioRuleDef & { id: string; effectiveFrom: Date; notes: string | null }) | null> {
  const r = await prisma.elogioRule.findFirst({ where: { effectiveFrom: { lte: localToDate(at) } }, orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }] });
  return r ? { id: r.id, amountPerElogio: Number(r.amountPerElogio), maxPerMonth: r.maxPerMonth, maxAmountPerMonth: N(r.maxAmountPerMonth), sources: r.sources, effectiveFrom: r.effectiveFrom, notes: r.notes } : null;
}

const elogioInput = z.object({ employeeId: z.string({ error: "Escolha o colaborador" }).min(1, "Escolha o colaborador"), date: dateStr, source: z.string({ error: "Informe a origem" }).trim().min(2, "Informe a origem").max(60), reference: z.string().trim().max(120).optional(), description: z.string().trim().max(1000).optional() });

export async function registerElogio(user: CurrentUser, raw: unknown) {
  assertCan(user, "remuneracao.manage");
  const d = elogioInput.parse(raw);
  const e = await scopedEmployee(user, d.employeeId);
  if (d.date < dateKey(e.admissionDate) || d.date > todayKey() || (e.terminationDate && d.date > dateKey(e.terminationDate))) throw new ValidationError("Data fora do vínculo do colaborador", { date: ["Fora do vínculo"] });
  if (d.reference && (await prisma.elogio.findFirst({ where: { employeeId: e.id, source: d.source, reference: d.reference } }))) throw new ValidationError("Elogio já registrado (mesma origem e referência)", { reference: ["Duplicado"] });
  const row = await prisma.elogio.create({ data: { employeeId: e.id, date: localToDate(d.date, "12:00"), source: d.source, reference: d.reference ?? null, description: d.description ?? null, createdById: user.id } });
  await recordAudit({ entityType: "Elogio", entityId: row.id, action: "CREATE", actorId: user.id, actorRole: user.role, newValue: d });
  return row;
}

export async function decideElogio(user: CurrentUser, id: string, raw: unknown) {
  assertCan(user, "remuneracao.manage");
  const d = z.object({ decision: z.enum(["APROVADO", "REJEITADO"]), rejectReason: z.string().trim().max(300).optional() }).parse(raw);
  const el = await prisma.elogio.findFirst({ where: { id, employee: employeeScopeWhere(user) } });
  if (!el) throw new NotFoundError("Elogio não encontrado");
  if (el.status !== "PENDENTE") throw new ValidationError("Elogio já analisado");
  if (d.decision === "REJEITADO" && !d.rejectReason) throw new ValidationError("Informe o motivo", { rejectReason: ["Obrigatório na rejeição"] });
  await prisma.elogio.update({ where: { id }, data: { status: d.decision, rejectReason: d.rejectReason ?? null, decidedById: user.id, decidedAt: new Date() } });
  await recordAudit({ entityType: "Elogio", entityId: id, action: d.decision === "APROVADO" ? "APPROVE" : "REJECT", actorId: user.id, actorRole: user.role, newValue: d });
}

export async function listElogios(user: CurrentUser, competenceKey?: string) {
  assertCan(user, "remuneracao.view");
  const r = competenceKey ? competenceRange(competenceKey) : null;
  return prisma.elogio.findMany({
    where: { employee: employeeScopeWhere(user), ...(r ? { date: { gte: localToDate(r.from), lt: localToDate(r.to) } } : {}) },
    orderBy: [{ status: "asc" }, { date: "desc" }], take: 300,
    include: { employee: { select: { id: true, fullName: true, department: { select: { name: true, unit: { select: { name: true } } } } } } },
  });
}

// ═════════ PPR ═════════

const pprInput = z.object({
  id: z.string().optional(), name: z.string().trim().min(3).max(100), periodStart: dateStr, periodEnd: dateStr, poolAmount: optMoney("Montante"),
  maxAchievementPct: z.coerce.number().int().min(50).max(300).default(100), minFactorPct: z.coerce.number().int().min(0).max(100).default(0),
  distribution: z.enum(["IGUAL", "PROPORCIONAL_SALARIO"]), minMonths: z.coerce.number().int().min(0).max(12).default(0), prorate: bool.default(true),
  unitId: z.string().optional(), status: z.enum(["RASCUNHO", "APURADO", "PAGO"]).default("RASCUNHO"), notes: z.string().trim().max(1000).optional(),
});

export async function savePpr(user: CurrentUser, raw: unknown) {
  assertConfig(user);
  const d = pprInput.parse(raw);
  if (d.periodEnd < d.periodStart) throw new ValidationError("Fim antes do início", { periodEnd: ["Antes do início"] });
  const data = { name: d.name, periodStart: localToDate(d.periodStart), periodEnd: localToDate(d.periodEnd), poolAmount: d.poolAmount, maxAchievementPct: d.maxAchievementPct, minFactorPct: d.minFactorPct, distribution: d.distribution, minMonths: d.minMonths, prorate: d.prorate, unitId: d.unitId || null, status: d.status, notes: d.notes ?? null };
  if (d.status !== "RASCUNHO" && d.id) {
    const goals = await prisma.pprGoal.findMany({ where: { programId: d.id } });
    const f = pprFactor(goals.map((g) => ({ weightPct: Number(g.weightPct), achievementPct: N(g.achievementPct) })), d.maxAchievementPct, d.minFactorPct);
    if (Math.abs(f.weightSum - 100) > 0.001) throw new ValidationError(`Os pesos das metas somam ${f.weightSum}% — precisam somar 100% para apurar`);
    if (f.factor === null) throw new ValidationError("Registre o atingimento de todas as metas antes de apurar");
    if (d.poolAmount === null) throw new ValidationError("Informe o montante do programa", { poolAmount: ["Obrigatório para apurar"] });
  }
  const saved = d.id ? await prisma.pprProgram.update({ where: { id: d.id }, data }) : await prisma.pprProgram.create({ data: { ...data, createdById: user.id } });
  await recordAudit({ entityType: "PprProgram", entityId: saved.id, action: d.id ? "UPDATE" : "CREATE", actorId: user.id, actorRole: user.role, newValue: data });
  return saved;
}

const goalInput = z.object({ id: z.string().optional(), programId: z.string(), name: z.string().trim().min(2).max(100), weightPct: z.coerce.number().positive().max(100), target: z.string().trim().max(200).optional(), achievementPct: z.preprocess((v) => (v === undefined || v === "" ? null : Number(String(v).replace(",", "."))), z.number().min(0).max(1000).nullable()) });

export async function savePprGoal(user: CurrentUser, raw: unknown) {
  assertConfig(user);
  const d = goalInput.parse(raw);
  const prog = await prisma.pprProgram.findUniqueOrThrow({ where: { id: d.programId }, include: { goals: true } });
  if (prog.status === "PAGO") throw new ValidationError("Programa pago — não pode ser alterado");
  const others = prog.goals.filter((g) => g.id !== d.id).reduce((s, g) => s + Number(g.weightPct), 0);
  if (others + d.weightPct > 100.001) throw new ValidationError(`Pesos ultrapassam 100% (já há ${others}%)`, { weightPct: ["Soma acima de 100%"] });
  const data = { name: d.name, weightPct: d.weightPct, target: d.target ?? null, achievementPct: d.achievementPct };
  const g = d.id ? await prisma.pprGoal.update({ where: { id: d.id }, data }) : await prisma.pprGoal.create({ data: { ...data, programId: d.programId, sortOrder: prog.goals.length } });
  await recordAudit({ entityType: "PprGoal", entityId: g.id, action: d.id ? "UPDATE" : "CREATE", actorId: user.id, actorRole: user.role, newValue: data });
  return g;
}

type EmpCore = { id: string; admission: string; termination: string | null; unitId: string; contractType: string; baseAt: (k: string) => number | null };

/** Distribuição do PPR sobre TODOS os colaboradores (o rateio é da empresa); a tela filtra pelo escopo de quem vê. */
async function computePrograms(emps: EmpCore[]) {
  const programs = await prisma.pprProgram.findMany({ include: { goals: { orderBy: { sortOrder: "asc" } } }, orderBy: { periodStart: "desc" } });
  return programs.map((p) => {
    const start = dateKey(p.periodStart), end = dateKey(p.periodEnd);
    const f = pprFactor(p.goals.map((g) => ({ weightPct: Number(g.weightPct), achievementPct: N(g.achievementPct) })), p.maxAchievementPct, p.minFactorPct);
    const projected = f.factor === null;
    const dist = pprDistribute(
      { periodStart: start, periodEnd: end, poolAmount: N(p.poolAmount), distribution: p.distribution, minMonths: p.minMonths, prorate: p.prorate, unitId: p.unitId },
      emps.map((e) => ({ id: e.id, admission: e.admission, termination: e.termination, unitId: e.unitId, contractType: e.contractType, base: e.baseAt(end) })),
      f.factor ?? 1
    );
    return { program: p, start, end, factor: f, projected, ...dist };
  });
}

export async function pprOverview(user: CurrentUser) {
  assertCan(user, "remuneracao.view");
  const all = await loadEmployees();
  const scope = new Set((await prisma.employee.findMany({ where: employeeScopeWhere(user), select: { id: true } })).map((e) => e.id));
  const names = new Map(all.map((e) => [e.id, e]));
  const programs = await computePrograms(all);
  return programs.map((p) => ({ ...p, shares: p.shares.filter((s) => scope.has(s.id)).map((s) => ({ ...s, name: names.get(s.id)!.name, unit: names.get(s.id)!.unitName })) }));
}

// ═════════ Base de colaboradores para os cálculos ═════════

async function loadEmployees(where: Prisma.EmployeeWhereInput = {}) {
  const rows = await prisma.employee.findMany({
    where,
    include: {
      salaries: true, position: { select: { id: true, title: true } }, department: { include: { unit: { select: { id: true, name: true } } } },
      payItems: { include: { type: true } }, benefits: { include: { benefit: { include: { units: true } } } }, elogios: { where: { status: "APROVADO" } },
    },
  });
  return rows.map((e) => {
    const history = e.salaries.map((s) => ({ amount: Number(s.amount), effectiveFrom: dateKey(s.effectiveFrom) }));
    return {
      id: e.id, name: e.fullName, internalId: e.internalId, status: e.status, contractType: e.contractType,
      admission: dateKey(e.admissionDate), termination: e.terminationDate ? dateKey(e.terminationDate) : null,
      unitId: e.department.unit.id, unitName: e.department.unit.name, departmentName: e.department.name, positionId: e.positionId, positionTitle: e.position.title,
      baseAt: (k: string) => resolveBase(N(e.baseSalary), history, k),
      payItems: e.payItems, benefits: e.benefits, elogios: e.elogios,
    };
  });
}

/** Remuneração total e custo da competência por colaborador (escopo de quem consulta). */
export async function competenceReport(user: CurrentUser, comp: string, f: { unidade?: string; departamento?: string; cargo?: string } = {}) {
  assertCan(user, "remuneracao.view");
  if (!isCompetence(comp)) throw new ValidationError("Competência inválida");
  const { from, last } = competenceRange(comp);
  const scoped = new Set((await prisma.employee.findMany({ where: employeeScopeWhere(user), select: { id: true } })).map((e) => e.id));
  const [all, rates, rule, table] = await Promise.all([
    loadEmployees(),
    prisma.chargeRate.findMany({ where: { active: true }, include: { units: true } }),
    ruleAt(last),
    prisma.positionSalary.findMany(),
  ]);
  const programs = await computePrograms(all);
  const rateDefs = rates.map((r) => ({ label: r.label, ratePct: N(r.ratePct) }));
  /** Alíquota efetiva: da unidade (ex.: RAT×FAP por CNPJ) › de aprendiz › geral. */
  const ratesFor = (unitId: string, contractType: string) => rates.map((r) => {
    const unit = r.units.find((u) => u.unitId === unitId);
    const pct = unit ? Number(unit.ratePct) : contractType === "APRENDIZ" && r.apprenticeRatePct !== null ? Number(r.apprenticeRatePct) : N(r.ratePct);
    return { label: r.label, ratePct: pct };
  });
  const rows = all
    .filter((e) => scoped.has(e.id) && e.admission <= last && (e.termination === null || e.termination >= from))
    .filter((e) => (!f.unidade || e.unitId === f.unidade) && (!f.departamento || e.departmentName === f.departamento) && (!f.cargo || e.positionId === f.cargo))
    .map((e) => {
      const base = e.baseAt(last);
      const items = e.payItems.filter((i) => i.competence === comp).map((i) => ({ category: i.type.category, amount: Number(i.amount), chargeable: i.type.chargeable, label: i.type.label, code: i.type.code }));
      const approved = e.elogios.filter((x) => { const k = dateKey(x.date); return k >= from && k <= last; });
      // Elogio já pago na folha (importado) não é recalculado pela regra — evita contar duas vezes
      const paidElogio = items.some((i) => i.code === "ELOGIO_PAGO_FOLHA");
      const el = approved.length && !paidElogio ? elogioPremium(rule, approved) : null;
      const benefits = e.benefits
        .filter((b) => dateKey(b.startDate) <= last && (!b.endDate || dateKey(b.endDate) >= from))
        .map((b) => {
          const def: BenefitDef = { name: b.benefit.name, costType: b.benefit.costType, companyCost: N(b.benefit.companyCost), dependentCost: N(b.benefit.dependentCost), discountType: b.benefit.discountType, discountValue: N(b.benefit.discountValue) };
          const unitCost = N(b.benefit.units.find((u) => u.unitId === e.unitId)?.companyCost);
          return { name: b.benefit.name, ...benefitCost(def, { companyCost: N(b.companyCost), daysPerMonth: b.daysPerMonth, dependents: b.dependents }, unitCost, base) };
        });
      // PPR: a cota do colaborador é provisionada nos meses que ele efetivamente trabalhou no período (≥ 15 dias)
      let ppr: { monthly: number; projected: boolean } | null = null;
      const worksThisMonth = monthsWorked(e.admission, e.termination, from, last) === 1;
      for (const p of programs) {
        if (p.start > last || p.end < from || !worksThisMonth) continue;
        const sh = p.shares.find((x) => x.id === e.id);
        if (!sh || sh.share === null || !sh.months) continue;
        const prev = ppr as { monthly: number; projected: boolean } | null;
        ppr = { monthly: Math.round(((prev?.monthly ?? 0) + sh.share / sh.months) * 100) / 100, projected: (prev?.projected ?? false) || p.projected };
      }
      const comp_ = totalCompensation({ contractType: e.contractType, base, items, elogio: el ? { value: el.value, counted: el.counted } : null, elogioRuleMissing: approved.length > 0 && !rule && !paidElogio, ppr, benefits, rates: ratesFor(e.unitId, e.contractType) });
      const tableRef = resolvePositionSalary(table.filter((t) => t.positionId === e.positionId).map((t) => ({ unitId: t.unitId, baseSalary: Number(t.baseSalary), minSalary: N(t.minSalary), maxSalary: N(t.maxSalary), effectiveFrom: dateKey(t.effectiveFrom) })), e.unitId, last);
      return { id: e.id, name: e.name, internalId: e.internalId, unitName: e.unitName, departmentName: e.departmentName, positionTitle: e.positionTitle, contractType: e.contractType, items, benefits, tableRef, comp: comp_, monthsInCompetence: monthsWorked(e.admission, e.termination, from, last) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const sum = (fn: (r: (typeof rows)[number]) => number | null) => Math.round(rows.reduce((s, r) => s + (fn(r) ?? 0), 0) * 100) / 100;
  const totals = {
    n: rows.length,
    base: sum((r) => r.comp.basePaid ?? r.comp.base), adicionais: sum((r) => r.comp.adicionais), variaveis: sum((r) => r.comp.variaveis),
    premiacoes: sum((r) => r.comp.premiacoes + (r.comp.elogio?.value ?? 0)), ppr: sum((r) => r.comp.ppr?.monthly ?? 0),
    beneficios: sum((r) => r.comp.beneficios.net), encargos: sum((r) => r.comp.encargos.total), dinheiro: sum((r) => r.comp.remuneracaoDinheiro),
    total: sum((r) => r.comp.remuneracaoTotal), custo: sum((r) => r.comp.custoTotal),
    partial: rows.filter((r) => r.comp.partial.length).length,
    noRates: rateDefs.every((r) => r.ratePct === null),
  };
  return { competence: comp, rows, totals, rule, rates: rateDefs };
}

/** Ficha de remuneração do colaborador. */
export async function employeeCompensation(user: CurrentUser, employeeId: string, comp: string) {
  assertCan(user, "remuneracao.view");
  const e = await scopedEmployee(user, employeeId);
  const report = await competenceReport(user, comp);
  const row = report.rows.find((r) => r.id === employeeId) ?? null;
  const [salaries, payItems, benefits, elogios] = await Promise.all([
    prisma.employeeSalary.findMany({ where: { employeeId }, orderBy: { effectiveFrom: "desc" } }),
    prisma.payItem.findMany({ where: { employeeId }, orderBy: [{ competence: "desc" }, { createdAt: "desc" }], include: { type: true }, take: 60 }),
    prisma.employeeBenefit.findMany({ where: { employeeId }, orderBy: { startDate: "desc" }, include: { benefit: true } }),
    prisma.elogio.findMany({ where: { employeeId }, orderBy: { date: "desc" }, take: 50 }),
  ]);
  return { employee: e, row, salaries, payItems, benefits, elogios, rule: report.rule };
}
