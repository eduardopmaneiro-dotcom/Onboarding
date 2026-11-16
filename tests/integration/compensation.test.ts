/**
 * Fase 6 — remuneração, benefícios e pesquisa salarial contra o PostgreSQL real (SEED_DEMO=true).
 * Unidade isolada com 3 colaboradores e valores conhecidos; cada total é comparado ao cálculo à mão.
 * Parâmetros globais (encargos, PPR existentes) são fixados no início e restaurados no fim.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../../src/lib/prisma";
import { asUser } from "../../prisma/demo-recruitment";
import { fakeCpf } from "../../prisma/demo-admission";
import { localToDate } from "../../src/lib/datetime";
import { createDirectEmployee } from "../../src/modules/people/service";
import {
  addEmployeeSalary, addPayItem, competenceReport, decideElogio, employeeCompensation, enrollBenefit, registerElogio, saveBenefit,
  saveElogioRule, savePositionSalary, savePpr, savePprGoal, pprOverview,
} from "../../src/modules/compensation/service";
import { buildSurvey, saveMarketSalary } from "../../src/modules/compensation/market";
import { toPublicError } from "../../src/modules/shared/errors";

const TAG = Date.now().toString(36).toUpperCase().slice(-6);
const SEED = Number(Date.now().toString().slice(-7));
const status = (e: unknown) => toPublicError(e).status;
type U = Awaited<ReturnType<typeof asUser>>;
let rh: U, rhBrisa: U, gestor: U;
let unitId = "", deptRec = "", deptSal = "", deptCoz = "";
const pos: Record<string, string> = {};
const E: Record<string, string> = {};
const B: Record<string, string> = {};
const types: Record<string, string> = {};
const C = "2026-09";
let savedRates: Array<{ id: string; ratePct: unknown; active: boolean }> = [];
let savedPools: Array<{ id: string; poolAmount: unknown }> = [];
let ruleId = "";
const close = (a: number | null | undefined, b: number) => assert.ok(a !== null && a !== undefined && Math.abs(a - b) < 0.006, `${a} ≠ ${b}`);

before(async () => {
  [rh, rhBrisa, gestor] = await Promise.all(["rh@rialehoteis.com.br", "rh.brisabarra@rialehoteis.com.br", "marina.souza@rialehoteis.com.br"].map((e) => asUser(prisma, e)));
  // parâmetros globais determinísticos (restaurados no after)
  savedRates = (await prisma.chargeRate.findMany()).map((r) => ({ id: r.id, ratePct: r.ratePct, active: r.active }));
  for (const r of await prisma.chargeRate.findMany()) await prisma.chargeRate.update({ where: { id: r.id }, data: { ratePct: r.code === "INSS_PATRONAL" ? 20 : r.code === "FGTS" ? 8 : null, active: true } });
  savedPools = (await prisma.pprProgram.findMany()).map((p) => ({ id: p.id, poolAmount: p.poolAmount }));
  await prisma.pprProgram.updateMany({ data: { poolAmount: null } });

  unitId = (await prisma.unit.create({ data: { name: `Remun Teste ${TAG}`, code: `REM_${TAG}` } })).id;
  deptRec = (await prisma.department.create({ data: { name: "Recepção", unitId } })).id;
  deptSal = (await prisma.department.create({ data: { name: "A&B — Salão", unitId } })).id;
  deptCoz = (await prisma.department.create({ data: { name: "A&B — Cozinha", unitId } })).id;
  for (const t of ["Recepcionista", "Garçom", "Auxiliar de Cozinha"]) pos[t] = (await prisma.position.findUniqueOrThrow({ where: { title: t } })).id;
  for (const t of await prisma.payItemType.findMany()) types[t.code] = t.id;

  E.A = (await createDirectEmployee(rh, { fullName: `Remun A ${TAG}`, cpf: fakeCpf(SEED + 1), admissionDate: "2025-01-10", positionId: pos.Recepcionista, departmentId: deptRec, contractType: "CLT", salary: "2000" })).id;
  E.B = (await createDirectEmployee(rh, { fullName: `Remun B ${TAG}`, cpf: fakeCpf(SEED + 2), admissionDate: "2026-07-01", positionId: pos["Garçom"], departmentId: deptSal, contractType: "CLT", salary: "1980" })).id;
  E.C = (await createDirectEmployee(rh, { fullName: `Remun C ${TAG}`, cpf: fakeCpf(SEED + 3), admissionDate: "2025-05-01", positionId: pos.Recepcionista, departmentId: deptRec, contractType: "PJ", salary: "8000" })).id;
});

after(async () => {
  for (const r of savedRates) await prisma.chargeRate.update({ where: { id: r.id }, data: { ratePct: r.ratePct as never, active: r.active } });
  for (const p of savedPools) await prisma.pprProgram.update({ where: { id: p.id }, data: { poolAmount: p.poolAmount as never } });
  if (ruleId) await prisma.elogioRule.delete({ where: { id: ruleId } });
  await prisma.pprProgram.deleteMany({ where: { name: { contains: TAG } } });
  await prisma.$disconnect();
});

test("Salário-base: histórico com vigência, validações e imutabilidade no banco", async () => {
  await assert.rejects(addEmployeeSalary(rh, E.A, { amount: "2200", effectiveFrom: "2024-12-01", reason: "Mérito" }), /anterior à admissão/);
  await assert.rejects(addEmployeeSalary(rh, E.A, { amount: "2200", effectiveFrom: "2026-07-01" }), /motivo/i);
  const s = await addEmployeeSalary(rh, E.A, { amount: "2.200,00", effectiveFrom: "2026-07-01", reason: "Mérito" });
  assert.equal(Number(s.amount), 2200);
  await assert.rejects(prisma.employeeSalary.update({ where: { id: s.id }, data: { amount: 9999 } }));
  assert.ok(await prisma.movementHistory.findFirst({ where: { employeeId: E.A, type: "ALTERACAO_SALARIAL" } }));
  await savePositionSalary(rh, { positionId: pos.Recepcionista, unitId, baseSalary: "2100", effectiveFrom: "2026-01-01", note: `Teste ${TAG}` });
  await assert.rejects(savePositionSalary(rhBrisa, { positionId: pos.Recepcionista, baseSalary: "2100", effectiveFrom: "2026-01-01" }), (e) => status(e) === 403);
});

test("Lançamentos pagos: rubricas calculadas bloqueadas, vínculo, futuro e duplicidade", async () => {
  await assert.rejects(addPayItem(rh, E.A, { typeId: types.ELOGIO_PREMIADO, competence: C, amount: "100" }), /calculado pelas regras/);
  await assert.rejects(addPayItem(rh, E.B, { typeId: types.ADIC_NOTURNO, competence: "2026-06", amount: "100" }), /fora do vínculo/i);
  await assert.rejects(addPayItem(rh, E.A, { typeId: types.ADIC_NOTURNO, competence: "2030-01", amount: "100" }), /futura/);
  await addPayItem(rh, E.A, { typeId: types.ADIC_NOTURNO, competence: C, amount: "300,00" });
  await addPayItem(rh, E.A, { typeId: types.TAXA_SERVICO, competence: C, amount: "450" });
  await addPayItem(rh, E.A, { typeId: types.PREMIO, competence: C, amount: "100" });
  await addPayItem(rh, E.B, { typeId: types.SALARIO_PAGO, competence: C, amount: "1900", description: "Faltas" });
  await assert.rejects(addPayItem(rh, E.B, { typeId: types.SALARIO_PAGO, competence: C, amount: "1900" }), /já lançado/);
  await assert.rejects(addPayItem(gestor, E.A, { typeId: types.PREMIO, competence: C, amount: "1" }), (e) => status(e) === 403);
});

test("Benefícios: valores com origem, disponibilidade por unidade, adesão e validações", async () => {
  await assert.rejects(saveBenefit(rh, { name: `VT ${TAG}`, category: "VALE_TRANSPORTE", costType: "POR_DIA", companyCost: "10", discountType: "PERCENTUAL_SALARIO", discountValue: "6" }), /origem dos valores/);
  B.VT = (await saveBenefit(rh, { name: `VT ${TAG}`, category: "VALE_TRANSPORTE", costType: "POR_DIA", companyCost: "10", discountType: "PERCENTUAL_SALARIO", discountValue: "6", valueSource: "Teste" })).id;
  B.SAUDE = (await saveBenefit(rh, { name: `Saúde ${TAG}`, category: "PLANO_SAUDE", costType: "MENSAL", companyCost: "400", dependentCost: "250", discountType: "FIXO", discountValue: "50", valueSource: "Teste" })).id;
  B.VAZIO = (await saveBenefit(rh, { name: `TotalPass ${TAG}`, category: "TOTALPASS", costType: "MENSAL", discountType: "NENHUM" })).id;
  const brisa = await prisma.unit.findUniqueOrThrow({ where: { code: "BRISA" } });
  B.FARM = (await saveBenefit(rh, { name: `Farmácia ${TAG}`, category: "FARMACIA", costType: "MENSAL", companyCost: "40", discountType: "NENHUM", allUnits: "false", unitIds: [brisa.id], valueSource: "Teste" })).id;
  await assert.rejects(saveBenefit(rhBrisa, { name: "x", category: "OUTRO", costType: "MENSAL", discountType: "NENHUM" }), (e) => status(e) === 403);
  await assert.rejects(enrollBenefit(rh, E.A, { benefitId: B.FARM, startDate: "2026-01-01" }), /não é oferecido na unidade/);
  await assert.rejects(enrollBenefit(rh, E.A, { benefitId: B.VT, startDate: "2026-01-01" }), /dias por mês/);
  await enrollBenefit(rh, E.A, { benefitId: B.VT, startDate: "2026-01-01", daysPerMonth: "22" });
  await assert.rejects(enrollBenefit(rh, E.A, { benefitId: B.VT, startDate: "2026-02-01", daysPerMonth: "22" }), /já tem este benefício/);
  await enrollBenefit(rh, E.A, { benefitId: B.SAUDE, startDate: "2026-01-01", dependents: "2" });
  await enrollBenefit(rh, E.B, { benefitId: B.VAZIO, startDate: "2026-07-01" });
});

test("Elogio Premiado: registro, aprovação/recusa e cálculo pela regra cadastrada", async () => {
  ruleId = (await saveElogioRule(rh, { amountPerElogio: "50", maxPerMonth: "3", effectiveFrom: "2026-08-01", notes: `Teste ${TAG}` })).id;
  for (let k = 1; k <= 5; k++) {
    const el = await registerElogio(rh, { employeeId: E.A, date: `${C}-${String(k).padStart(2, "0")}`, source: k % 2 ? "Booking" : "Google", reference: `${TAG}-${k}` });
    await decideElogio(rh, el.id, { decision: "APROVADO" });
  }
  await assert.rejects(registerElogio(rh, { employeeId: E.A, date: `${C}-10`, source: "Booking", reference: `${TAG}-1` }), /já registrado/);
  const rej = await registerElogio(rh, { employeeId: E.A, date: `${C}-11`, source: "Google", reference: `${TAG}-R` });
  await assert.rejects(decideElogio(rh, rej.id, { decision: "REJEITADO" }), /motivo/i);
  await decideElogio(rh, rej.id, { decision: "REJEITADO", rejectReason: "Elogio à equipe, não nominal" });
  await registerElogio(rh, { employeeId: E.A, date: `${C}-12`, source: "Google", reference: `${TAG}-P` }); // pendente
  await assert.rejects(registerElogio(rh, { employeeId: E.B, date: "2026-06-15", source: "Google" }), /fora do vínculo/i);
});

test("PPR parametrizável: pesos, apuração, gatilho e distribuição proporcional", async () => {
  const p = await savePpr(rh, { name: `PPR ${TAG}`, periodStart: "2026-01-01", periodEnd: "2026-12-31", poolAmount: "12000", distribution: "IGUAL", minMonths: "3", prorate: "true", unitId, maxAchievementPct: "100", minFactorPct: "60" });
  await savePprGoal(rh, { programId: p.id, name: "NPS", weightPct: "60", achievementPct: "100" });
  await assert.rejects(savePprGoal(rh, { programId: p.id, name: "GOP", weightPct: "50" }), /ultrapassam 100%/);
  const g2 = await savePprGoal(rh, { programId: p.id, name: "GOP", weightPct: "40" });
  await assert.rejects(savePpr(rh, { id: p.id, name: p.name, periodStart: "2026-01-01", periodEnd: "2026-12-31", poolAmount: "12000", distribution: "IGUAL", unitId, status: "APURADO" }), /atingimento de todas as metas/);
  await savePprGoal(rh, { id: g2.id, programId: p.id, name: "GOP", weightPct: "40", achievementPct: "100" });
  const ov = (await pprOverview(rh)).find((x) => x.program.id === p.id)!;
  assert.equal(ov.factor.factor, 1);
  assert.equal(ov.eligible, 2); // A (12 meses) e B (6 meses); C é PJ
  assert.deepEqual(ov.shares.map((s) => [s.name.split(" ")[1], s.share]).sort(), [["A", 8000], ["B", 4000]]);
  // gatilho: 60% × 100 + 40% × 0 = 60% → paga; 60% × 90 + 40% × 0 = 54% < 60% → nada
  await savePprGoal(rh, { id: g2.id, programId: p.id, name: "GOP", weightPct: "40", achievementPct: "0" });
  const nps = await prisma.pprGoal.findFirstOrThrow({ where: { programId: p.id, name: "NPS" } });
  await savePprGoal(rh, { id: nps.id, programId: p.id, name: "NPS", weightPct: "60", achievementPct: "90" });
  assert.equal((await pprOverview(rh)).find((x) => x.program.id === p.id)!.pool, 0);
  await savePprGoal(rh, { id: nps.id, programId: p.id, name: "NPS", weightPct: "60", achievementPct: "100" });
  await savePprGoal(rh, { id: g2.id, programId: p.id, name: "GOP", weightPct: "40", achievementPct: "100" });
});

test("Remuneração total e custo: parcelas separadas conferidas à mão", async () => {
  const r = await competenceReport(rh, C, { unidade: unitId });
  assert.equal(r.rows.length, 3);
  const a = r.rows.find((x) => x.id === E.A)!.comp;
  assert.equal(a.base, 2200); // vigente em setembro (alteração de julho)
  assert.equal(a.basePaid, null);
  assert.deepEqual([a.adicionais, a.variaveis, a.premiacoes], [300, 450, 100]);
  assert.deepEqual(a.elogio, { value: 150, counted: 3 }); // 5 aprovados, teto de 3 × R$ 50
  close(a.ppr?.monthly, 8000 / 12); // 12 meses trabalhados
  close(a.remuneracaoDinheiro, 2200 + 300 + 450 + 100 + 150 + 8000 / 12);
  assert.deepEqual(a.beneficios, { gross: 1120, discount: 182, net: 938 }); // VT 220−132 + saúde 900−50
  assert.equal(a.encargos.base, 2950); // salário + adicional + taxa de serviço (prêmio, Elogio e PPR não incidem)
  assert.equal(a.encargos.total, 826); // 28%
  close(a.custoTotal, 2200 + 300 + 450 + 100 + 150 + 8000 / 12 + 938 + 826);
  assert.ok(a.remuneracaoTotal > a.base!, "remuneração total ≠ salário-base");
  assert.ok(a.partial.some((p) => p.includes("Encargos sem alíquota")), "alíquotas não informadas aparecem como pendência");
  const b = r.rows.find((x) => x.id === E.B)!.comp;
  assert.equal(b.base, 1980);
  assert.equal(b.basePaid, 1900);
  close(b.remuneracaoDinheiro, 1900 + 4000 / 6); // cota de B (6 meses) provisionada nos 6 meses trabalhados
  assert.equal(b.encargos.total, 532); // 28% de 1.900 (salário pago)
  assert.ok(b.partial.some((p) => p.includes(`TotalPass ${TAG}: valor não cadastrado`)));
  const c = r.rows.find((x) => x.id === E.C)!.comp;
  assert.deepEqual([c.encargos.total, c.custoTotal, c.ppr], [0, 8000, null]); // PJ
  const tableRef = r.rows.find((x) => x.id === E.A)!.tableRef;
  assert.deepEqual(tableRef, { value: 2100, scope: "unidade", min: null, max: null });
  close(r.totals.custo, a.custoTotal + b.custoTotal + c.custoTotal);
  assert.equal(r.totals.premiacoes, 250); // prêmio 100 + Elogio 150
  // filtro por cargo e competência sem vínculo
  assert.equal((await competenceReport(rh, C, { unidade: unitId, cargo: pos["Garçom"] })).rows.length, 1);
  assert.equal((await competenceReport(rh, "2026-06", { unidade: unitId })).rows.length, 2); // B ainda não admitido
});

test("Acesso restrito: gestor sem acesso; RH de outra unidade não vê; política só corporativa", async () => {
  await assert.rejects(competenceReport(gestor, C), (e) => status(e) === 403);
  await assert.rejects(employeeCompensation(gestor, E.A, C), (e) => status(e) === 403);
  await assert.rejects(buildSurvey(gestor, {}), (e) => status(e) === 403);
  assert.ok(!(await competenceReport(rhBrisa, C)).rows.some((x) => x.id === E.A));
  await assert.rejects(employeeCompensation(rhBrisa, E.A, C), (e) => status(e) === 404);
  await assert.rejects(savePpr(rhBrisa, { name: "x", periodStart: "2026-01-01", periodEnd: "2026-12-31", distribution: "IGUAL" }), (e) => status(e) === 403);
  const ppr = (await pprOverview(rhBrisa)).find((x) => x.program.name === `PPR ${TAG}`)!;
  assert.equal(ppr.shares.length, 0, "RH de outra unidade não vê valores individuais");
  assert.ok(await prisma.auditLog.findFirst({ where: { entityType: "EmployeeSalary", actorId: rh.id } }));
});

test("Pesquisa salarial: pretensão, oferta, diferença, motivos, benefícios, praticado, mercado e dificuldade", async () => {
  const job = await prisma.jobOpening.create({ data: { code: `REM-${TAG}`, positionId: pos["Auxiliar de Cozinha"], departmentId: deptCoz, headcount: 1, status: "ABERTA", openedAt: localToDate("2026-09-01") } });
  const reasons = Object.fromEntries((await prisma.rejectionReason.findMany()).map((r) => [r.code, r.id]));
  const apps: Array<[number | null, number | null, number | null, string[], "APROVADO" | "DESISTIU" | "REPROVADO", string | null]> = [
    [1900, 1750, 1700, ["Vale-transporte", "Plano de saúde"], "APROVADO", null],
    [2100, 1750, 1800, ["Plano de saúde"], "DESISTIU", reasons.PRETENSAO_SALARIAL],
    [1700, null, null, [], "REPROVADO", reasons.EXPERIENCIA],
  ];
  for (const [i, [e, o, l, bens, res, reason]] of apps.entries()) {
    const c = await prisma.candidate.create({ data: { fullName: `Pesq ${i} ${TAG}`, nameNormalized: `pesq ${i} ${TAG.toLowerCase()}` } });
    const a = await prisma.application.create({ data: { candidateId: c.id, jobOpeningId: job.id, status: res === "APROVADO" ? "AGUARDANDO_GESTOR" : res === "DESISTIU" ? "DESISTENTE" : "REPROVADO", expectedSalary: e, offeredSalary: o, lastSalary: l, valuedBenefits: bens } });
    await prisma.interview.create({ data: { applicationId: a.id, scheduledAt: localToDate(`2026-09-${10 + i}`, "09:00"), status: "REALIZADA", result: res, reasonId: reason } });
  }
  const cozE = await createDirectEmployee(rh, { fullName: `Remun D ${TAG}`, cpf: fakeCpf(SEED + 4), admissionDate: "2026-02-01", positionId: pos["Auxiliar de Cozinha"], departmentId: deptCoz, salary: "1750" });
  assert.ok(cozE);
  await assert.rejects(saveMarketSalary(rh, { positionId: pos["Auxiliar de Cozinha"], companyName: "Hotel X", source: "ANUNCIO_VAGA", baseSalary: "2000", totalComp: "1500", collectedAt: "2026-10-01", reference: "anúncio" }), /menor que o salário-base/);
  await assert.rejects(saveMarketSalary(rh, { positionId: pos["Auxiliar de Cozinha"], companyName: "Hotel X", source: "ANUNCIO_VAGA", baseSalary: "2000", collectedAt: "2026-10-01" }), /referência/);
  await assert.rejects(saveMarketSalary(gestor, { positionId: pos["Auxiliar de Cozinha"], companyName: "Hotel X", source: "OUTRO", baseSalary: "2000", collectedAt: "2026-10-01", reference: "x" }), (e) => status(e) === 403);
  await saveMarketSalary(rh, { positionId: pos["Auxiliar de Cozinha"], companyName: `Hotel Teste 1 ${TAG}`, hotelCategory: "Upscale", region: "Copacabana", source: "ANUNCIO_VAGA", baseSalary: "1800", collectedAt: "2026-10-01", reference: "anúncio de teste" });
  await saveMarketSalary(rh, { positionId: pos["Auxiliar de Cozinha"], companyName: `Hotel Teste 2 ${TAG}`, source: "CONCORRENTE", baseSalary: "2000", totalComp: "2600", collectedAt: "2026-10-01", reference: "contato de teste" });

  const s = await buildSurvey(rh, { gran: "ano", ref: "2026-06-01", unidade: unitId, cargo: pos["Auxiliar de Cozinha"] });
  assert.equal(s.appsInPeriod, 3);
  assert.deepEqual([s.overall.expected.n, s.overall.expected.mean, s.overall.expected.median], [3, 1900, 1900]);
  assert.deepEqual([s.overall.offered.n, s.overall.offered.median], [2, 1750]);
  assert.deepEqual([s.overall.last.n, s.overall.last.median], [2, 1750]);
  assert.deepEqual([s.overall.gap.n, s.overall.gap.meanDiff, s.overall.gap.meanPct, s.overall.gap.aboveOffer], [2, 250, 14.3, 2]);
  assert.deepEqual(s.declines, [{ label: "Pretensão salarial", value: 1 }]);
  assert.deepEqual(s.rejections, [{ label: "RH: Falta de experiência", value: 1 }]);
  assert.deepEqual(s.benefits, [{ label: "Plano de saúde", value: 2 }, { label: "Vale-transporte", value: 1 }]);
  const row = s.rows.find((r) => r.positionId === pos["Auxiliar de Cozinha"])!;
  assert.deepEqual([row.practiced.n, row.practiced.median], [1, 1750]);
  assert.ok(row.marketBase.n >= 2);
  assert.equal(row.marketTotal.n >= 1, true);
  assert.equal(row.difficulty.openNow, 1);
  assert.equal(row.difficulty.interviewed, 3);
  close(row.difficulty.withdrawalRate, 1 / 3);
  assert.equal(row.difficulty.aboveOfferRate, 1);
  // período sem dados: estatísticas vazias, nunca zero
  const empty = await buildSurvey(rh, { gran: "ano", ref: "2020-06-01", unidade: unitId });
  assert.equal(empty.overall.expected.mean, null);
});
