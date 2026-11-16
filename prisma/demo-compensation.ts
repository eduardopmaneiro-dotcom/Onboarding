/**
 * Remuneração de demonstração — VALORES FICTÍCIOS, apenas com SEED_DEMO (nunca em produção).
 * Usa os serviços das telas: tabela salarial, salários, lançamentos, benefícios, encargos,
 * Elogio Premiado, PPR e registros de mercado.
 */
import type { PrismaClient } from "@prisma/client";
import { addDays, dateKey, todayKey } from "../src/lib/datetime";
import { asUser } from "./demo-recruitment";
import { addEmployeeSalary, addPayItem, decideElogio, enrollBenefit, registerElogio, saveBenefit, saveElogioRule, savePositionSalary, savePpr, savePprGoal, saveRate } from "../src/modules/compensation/service";
import { saveMarketSalary } from "../src/modules/compensation/market";
import { shiftCompetence } from "../src/modules/compensation/calc";

const DEMO = "DEMONSTRAÇÃO — valor fictício";

export async function simulateCompensation(prisma: PrismaClient) {
  const rh = await asUser(prisma, "rh@rialehoteis.com.br");
  const today = todayKey();
  const pos = async (t: string) => (await prisma.position.findUniqueOrThrow({ where: { title: t } })).id;
  const table: Array<[string, number]> = [["Recepcionista", 2150], ["Camareira", 1850], ["Garçom", 1980], ["Auxiliar de Cozinha", 1750], ["Auxiliar de Manutenção", 2000]];
  for (const [t, v] of table) await savePositionSalary(rh, { positionId: await pos(t), baseSalary: v, effectiveFrom: "2026-01-01", note: DEMO });
  const brisa = await prisma.unit.findUniqueOrThrow({ where: { code: "BRISA" } });
  await savePositionSalary(rh, { positionId: await pos("Recepcionista"), unitId: brisa.id, baseSalary: 2200, effectiveFrom: "2026-01-01", note: DEMO });

  // salário-base de quem foi cadastrado sem salário (valores da tabela fictícia)
  const emps = await prisma.employee.findMany({ where: { status: { not: "DESLIGADO" } }, include: { position: true } });
  let salaries = 0;
  for (const e of emps) {
    const ref = table.find(([t]) => t === e.position.title)?.[1];
    if (!e.baseSalary && ref) { await addEmployeeSalary(rh, e.id, { amount: ref, effectiveFrom: dateKey(e.admissionDate), reason: `Salário de referência (${DEMO})` }); salaries++; }
  }

  // benefícios: valores fictícios com origem marcada como demonstração; TotalPass fica sem valor (aparece como pendente)
  const b = async (code: string) => prisma.benefit.findUniqueOrThrow({ where: { code } });
  const vt = await b("VT");
  await saveBenefit(rh, { id: vt.id, name: vt.name, category: vt.category, costType: "POR_DIA", companyCost: "10,00", discountType: "PERCENTUAL_SALARIO", discountValue: "6", allUnits: "true", valueSource: DEMO });
  const al = await b("ALIMENTACAO");
  await saveBenefit(rh, { id: al.id, name: al.name, category: al.category, costType: "MENSAL", companyCost: "450,00", discountType: "NENHUM", allUnits: "true", valueSource: DEMO });
  const sa = await b("PLANO_SAUDE");
  await saveBenefit(rh, { id: sa.id, name: sa.name, category: sa.category, costType: "MENSAL", companyCost: "380,00", dependentCost: "250,00", discountType: "FIXO", discountValue: "50,00", allUnits: "true", valueSource: DEMO });
  const uva = await b("EDU_UVA");
  await saveBenefit(rh, { id: uva.id, name: uva.name, category: uva.category, costType: "SEM_CUSTO", discountType: "NENHUM", allUnits: "true", description: "Convênio de desconto (demonstração)" });
  const fa = await b("FARMACIA");
  await saveBenefit(rh, { id: fa.id, name: fa.name, category: fa.category, costType: "MENSAL", companyCost: "40,00", discountType: "NENHUM", allUnits: "false", unitIds: [brisa.id], valueSource: DEMO });
  const tp = await b("TOTALPASS");
  for (const [i, e] of emps.entries()) {
    const start = dateKey(e.admissionDate) > "2026-01-01" ? dateKey(e.admissionDate) : "2026-01-01";
    await enrollBenefit(rh, e.id, { benefitId: vt.id, startDate: start, daysPerMonth: "22" });
    await enrollBenefit(rh, e.id, { benefitId: al.id, startDate: start });
    if (i % 2 === 0) await enrollBenefit(rh, e.id, { benefitId: sa.id, startDate: start, dependents: String(i % 3) });
    if (i % 4 === 0) await enrollBenefit(rh, e.id, { benefitId: tp.id, startDate: start });
  }

  // encargos fictícios (a empresa substitui pelas alíquotas do seu regime); um item fica sem alíquota
  const rates: Record<string, number | null> = { INSS_PATRONAL: 20, RAT_FAP: 3, TERCEIROS: 5.8, FGTS: 8, PROV_13: 8.33, PROV_FERIAS: 11.11, ENC_PROVISOES: null };
  for (const r of await prisma.chargeRate.findMany()) await saveRate(rh, { id: r.id, label: r.label, ratePct: rates[r.code] === null || rates[r.code] === undefined ? "" : String(rates[r.code]), legalRef: `${r.legalRef ?? ""} (${DEMO})`, active: "true" });

  // lançamentos pagos na competência anterior
  const comp = shiftCompetence(today.slice(0, 7), -1);
  const types = Object.fromEntries((await prisma.payItemType.findMany()).map((t) => [t.code, t.id]));
  let items = 0;
  for (const e of emps) {
    if (dateKey(e.admissionDate) > `${comp}-28`) continue;
    if (e.position.title === "Recepcionista") { await addPayItem(rh, e.id, { typeId: types.ADIC_NOTURNO, competence: comp, amount: "215,00" }); items++; }
    if (e.position.title === "Garçom") { await addPayItem(rh, e.id, { typeId: types.TAXA_SERVICO, competence: comp, amount: "640,00" }); items++; }
  }
  const veteran = emps.find((e) => dateKey(e.admissionDate) <= `${comp}-01`);
  if (veteran) { await addPayItem(rh, veteran.id, { typeId: types.PREMIO, competence: comp, amount: "300,00", description: "Campanha de vendas (demonstração)" }); items++; }

  // Elogio Premiado: regra fictícia + elogios
  await saveElogioRule(rh, { amountPerElogio: "50,00", maxPerMonth: "3", effectiveFrom: "2026-01-01", notes: DEMO });
  const target = emps.filter((e) => dateKey(e.admissionDate) <= `${comp}-01`).slice(0, 2);
  for (const [i, e] of target.entries()) {
    for (let k = 0; k < (i === 0 ? 4 : 1); k++) {
      const el = await registerElogio(rh, { employeeId: e.id, date: `${comp}-${String(5 + k).padStart(2, "0")}`, source: k % 2 ? "Google" : "Booking", reference: `DEMO-${i}-${k}` });
      await decideElogio(rh, el.id, { decision: "APROVADO" });
    }
  }
  if (target[1]) await registerElogio(rh, { employeeId: target[1].id, date: addDays(today, -1), source: "Livro de hóspedes", reference: "DEMO-PEND" });

  // PPR parametrizado (metas ainda não apuradas → projeção a 100%)
  const ppr = await savePpr(rh, { name: "PPR 2026 (demonstração)", periodStart: "2026-01-01", periodEnd: "2026-12-31", poolAmount: "60000", distribution: "IGUAL", minMonths: "3", prorate: "true", maxAchievementPct: "100", minFactorPct: "60", notes: DEMO });
  await savePprGoal(rh, { programId: ppr.id, name: "Satisfação do hóspede (NPS)", weightPct: "50", target: "NPS ≥ 70" });
  await savePprGoal(rh, { programId: ppr.id, name: "GOP sobre receita", weightPct: "50", target: "≥ 32%" });

  // mercado (hotéis fictícios)
  const mk: Array<[string, string, string, string, number | null, number | null]> = [
    ["Recepcionista", "Hotel Concorrente A (fictício)", "Upscale", "Barra da Tijuca", 2300, 3100],
    ["Recepcionista", "Hotel Concorrente B (fictício)", "Midscale", "Copacabana", 2050, null],
    ["Garçom", "Hotel Concorrente A (fictício)", "Upscale", "Barra da Tijuca", 1950, 3400],
    ["Camareira", "Hotel Concorrente C (fictício)", "Luxo", "Ipanema", 2100, 2900],
  ];
  for (const [p, c, cat, reg, base, total] of mk) await saveMarketSalary(rh, { positionId: await pos(p), companyName: c, hotelCategory: cat, region: reg, source: "ANUNCIO_VAGA", baseSalary: base ?? "", totalComp: total ?? "", collectedAt: addDays(today, -10), reference: DEMO });
  return { salaries, items, market: mk.length };
}
