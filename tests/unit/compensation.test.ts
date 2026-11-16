import { test } from "node:test";
import assert from "node:assert/strict";
import { benefitCost, charges, competenceRange, elogioPremium, monthsWorked, pprDistribute, pprFactor, resolveBase, resolvePositionSalary, shiftCompetence, totalCompensation } from "../../src/modules/compensation/calc";

const VT = { name: "Vale-transporte", costType: "POR_DIA" as const, companyCost: 10, dependentCost: null, discountType: "PERCENTUAL_SALARIO" as const, discountValue: 6 };

test("Competência e vigências", () => {
  assert.deepEqual(competenceRange("2026-02"), { from: "2026-02-01", to: "2026-03-01", last: "2026-02-28" });
  assert.equal(competenceRange("2026-12").to, "2027-01-01");
  assert.equal(shiftCompetence("2026-01", -1), "2025-12");
  assert.equal(resolveBase(2000, [{ amount: 2200, effectiveFrom: "2026-03-01" }, { amount: 2400, effectiveFrom: "2026-06-01" }], "2026-04-30"), 2200);
  assert.equal(resolveBase(2000, [{ amount: 2200, effectiveFrom: "2026-03-01" }], "2026-02-28"), 2000);
  assert.equal(resolveBase(null, [], "2026-02-28"), null);
  const table = [{ unitId: null, baseSalary: 2000, effectiveFrom: "2026-01-01" }, { unitId: "U1", baseSalary: 2100, effectiveFrom: "2026-01-01" }, { unitId: null, baseSalary: 2050, effectiveFrom: "2026-07-01" }];
  assert.deepEqual(resolvePositionSalary(table, "U1", "2026-08-01"), { value: 2100, scope: "unidade", min: null, max: null });
  assert.deepEqual(resolvePositionSalary(table, "U2", "2026-08-01"), { value: 2050, scope: "geral", min: null, max: null });
  assert.equal(resolvePositionSalary(table, "U2", "2025-12-31"), null);
});

test("Benefícios: valor por dia, desconto de 6% limitado ao custo, dependentes, valor ausente", () => {
  // VT 10/dia × 22 = 220; 6% de 2.000 = 120 → líquido 100
  assert.deepEqual(benefitCost(VT, { companyCost: null, daysPerMonth: 22, dependents: 0 }, null, 2000), { gross: 220, discount: 120, net: 100, missing: null });
  // salário alto: 6% de 5.000 = 300 > 220 → desconto limitado a 220
  assert.equal(benefitCost(VT, { companyCost: null, daysPerMonth: 22, dependents: 0 }, null, 5000).net, 0);
  // tarifa individual da adesão tem precedência
  assert.equal(benefitCost(VT, { companyCost: 12.5, daysPerMonth: 20, dependents: 0 }, 11, 2000).gross, 250);
  assert.match(benefitCost(VT, { companyCost: null, daysPerMonth: null, dependents: 0 }, null, 2000).missing!, /dias por mês/);
  const saude = { name: "Plano de saúde", costType: "MENSAL" as const, companyCost: 400, dependentCost: 250, discountType: "FIXO" as const, discountValue: 50 };
  assert.deepEqual(benefitCost(saude, { companyCost: null, daysPerMonth: null, dependents: 2 }, null, 2000), { gross: 900, discount: 50, net: 850, missing: null });
  assert.equal(benefitCost(saude, { companyCost: null, daysPerMonth: null, dependents: 0 }, 380, 2000).gross, 380); // valor da unidade
  const semValor = { ...saude, companyCost: null };
  assert.match(benefitCost(semValor, { companyCost: null, daysPerMonth: null, dependents: 0 }, null, 2000).missing!, /valor não cadastrado/);
  const conv = { name: "UVA", costType: "SEM_CUSTO" as const, companyCost: null, dependentCost: null, discountType: "NENHUM" as const, discountValue: null };
  assert.deepEqual(benefitCost(conv, { companyCost: null, daysPerMonth: null, dependents: 0 }, null, null), { gross: 0, discount: 0, net: 0, missing: null });
});

test("Elogio Premiado: valor por elogio, limite de quantidade e de valor, origens elegíveis", () => {
  assert.equal(elogioPremium(null, [{ source: "Google" }]), null);
  const rule = { amountPerElogio: 50, maxPerMonth: 3, maxAmountPerMonth: null, sources: [] };
  assert.deepEqual(elogioPremium(rule, Array(5).fill({ source: "Google" })), { eligible: 5, counted: 3, value: 150 });
  assert.equal(elogioPremium({ ...rule, maxAmountPerMonth: 120 }, Array(5).fill({ source: "Google" }))!.value, 120);
  assert.deepEqual(elogioPremium({ ...rule, sources: ["Booking"] }, [{ source: "Google" }, { source: "Booking" }]), { eligible: 1, counted: 1, value: 50 });
});

test("Encargos: só com alíquota cadastrada", () => {
  assert.equal(charges([{ label: "INSS", ratePct: null }], 1000).total, null);
  const c = charges([{ label: "A", ratePct: 20 }, { label: "B", ratePct: 8 }, { label: "C", ratePct: null }], 2500);
  assert.equal(c.total, 700);
  assert.deepEqual(c.missing, ["C"]);
});

test("PPR: atingimento ponderado com teto e gatilho; proporcionalidade por meses (≥ 15 dias)", () => {
  assert.equal(pprFactor([{ weightPct: 60, achievementPct: 100 }, { weightPct: 40, achievementPct: null }], 100, 0).factor, null);
  // 60% × min(120,100) + 40% × 50 = 80%
  assert.equal(pprFactor([{ weightPct: 60, achievementPct: 120 }, { weightPct: 40, achievementPct: 50 }], 100, 0).factor, 0.8);
  assert.equal(pprFactor([{ weightPct: 60, achievementPct: 120 }, { weightPct: 40, achievementPct: 50 }], 120, 0).factor, 0.92);
  assert.equal(pprFactor([{ weightPct: 100, achievementPct: 60 }], 100, 70).factor, 0); // abaixo do gatilho
  assert.equal(monthsWorked("2025-01-01", null, "2026-01-01", "2026-12-31"), 12);
  assert.equal(monthsWorked("2026-03-17", null, "2026-01-01", "2026-12-31"), 10); // março com 15 dias conta
  assert.equal(monthsWorked("2026-03-18", null, "2026-01-01", "2026-12-31"), 9); // 14 dias não conta
  assert.equal(monthsWorked("2025-01-01", "2026-06-14", "2026-01-01", "2026-12-31"), 5);
  const p = { periodStart: "2026-01-01", periodEnd: "2026-12-31", poolAmount: 12000, distribution: "IGUAL" as const, minMonths: 3, prorate: true, unitId: null };
  const emps = [
    { id: "a", admission: "2025-01-01", termination: null, base: 2000, unitId: "U1", contractType: "CLT" }, // 12 meses
    { id: "b", admission: "2026-07-01", termination: null, base: 4000, unitId: "U1", contractType: "CLT" }, // 6 meses
    { id: "c", admission: "2026-11-01", termination: null, base: 3000, unitId: "U1", contractType: "CLT" }, // 2 meses < mínimo
    { id: "d", admission: "2025-01-01", termination: null, base: 9000, unitId: "U1", contractType: "PJ" }, // não elegível
  ];
  const d = pprDistribute(p, emps, 0.8); // pool 9.600; pesos 1 e 0,5
  assert.equal(d.pool, 9600);
  assert.equal(d.eligible, 2);
  assert.deepEqual(d.shares.map((s) => [s.id, s.share]), [["a", 6400], ["b", 3200]]);
  const prop = pprDistribute({ ...p, distribution: "PROPORCIONAL_SALARIO" }, emps, 1); // pesos 2000 e 4000×0,5=2000
  assert.deepEqual(prop.shares.map((s) => s.share), [6000, 6000]);
});

test("Remuneração total: parcelas separadas, encargos só sobre rubricas com incidência", () => {
  const r = totalCompensation({
    contractType: "CLT", base: 2000,
    items: [{ category: "ADICIONAL", amount: 300, chargeable: true }, { category: "VARIAVEL", amount: 450, chargeable: true }, { category: "PREMIACAO", amount: 100, chargeable: false }],
    elogio: { value: 150, counted: 3 }, elogioRuleMissing: false, ppr: { monthly: 200, projected: false },
    benefits: [{ gross: 220, discount: 120, net: 100, missing: null }, { gross: 900, discount: 50, net: 850, missing: null }],
    rates: [{ label: "A", ratePct: 20 }, { label: "B", ratePct: 8 }],
  });
  assert.equal(r.base, 2000);
  assert.equal(r.remuneracaoDinheiro, 3200); // 2000 + 300 + 450 + 100 + 150 + 200
  assert.equal(r.beneficios.net, 950);
  assert.equal(r.remuneracaoTotal, 4150);
  assert.equal(r.encargos.base, 2750); // 2000 + 300 + 450 (prêmios, Elogio e PPR não incidem)
  assert.equal(r.encargos.total, 770); // 28% de 2.750
  assert.equal(r.custoTotal, 4920);
  assert.deepEqual(r.partial, []);
  // salário pago diferente do contratual (admissão no meio do mês) e sem alíquotas
  const p = totalCompensation({ contractType: "CLT", base: 3000, items: [{ category: "BASE_PAGO", amount: 1500, chargeable: true }], elogio: null, elogioRuleMissing: true, ppr: null, benefits: [{ gross: null, discount: null, net: null, missing: "Plano de saúde: valor não cadastrado" }], rates: [{ label: "INSS", ratePct: null }] });
  assert.equal(p.basePaid, 1500);
  assert.equal(p.remuneracaoDinheiro, 1500);
  assert.equal(p.encargos.total, null);
  assert.equal(p.custoTotal, 1500);
  assert.equal(p.partial.length, 3);
  // PJ: sem encargos de folha
  assert.equal(totalCompensation({ contractType: "PJ", base: 8000, items: [], elogio: null, elogioRuleMissing: false, ppr: null, benefits: [], rates: [{ label: "A", ratePct: 20 }] }).custoTotal, 8000);
});
