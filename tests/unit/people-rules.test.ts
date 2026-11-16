import { test } from "node:test";
import assert from "node:assert/strict";
import { milestoneDate, parseMilestones, probationEnd, retainedAt, tenureDays, tenureLabel, terminatedDuringProbation } from "../../src/modules/people/rules";
import { headcount, probationTerminations, retention, tenureOfLeavers, turnoverBy, type EmpRec } from "../../src/modules/people/metrics";

const CLT = { milestones: [30, 45, 90], countAdmissionDay: true };

test("Marcos: dia da admissão conta como 1º dia (CLT) — 30/45/90", () => {
  assert.equal(milestoneDate("2026-03-02", 30, true), "2026-03-31");
  assert.equal(milestoneDate("2026-03-02", 45, true), "2026-04-15");
  assert.equal(milestoneDate("2026-03-02", 90, true), "2026-05-30");
  assert.equal(probationEnd("2026-03-02", CLT), "2026-05-30");
  // virada de ano e fevereiro
  assert.equal(milestoneDate("2025-12-20", 45, true), "2026-02-02");
  assert.equal(milestoneDate("2028-02-01", 30, true), "2028-03-01"); // ano bissexto: fevereiro com 29 dias
});

test("Marcos: regra alternativa sem contar o dia da admissão", () => {
  assert.equal(milestoneDate("2026-03-02", 30, false), "2026-04-01");
  assert.deepEqual(parseMilestones("30, 60 ,90"), [30, 60, 90]);
});

test("Tempo de casa: dias inclusivos e por extenso", () => {
  assert.equal(tenureDays("2026-03-02", "2026-03-02"), 1);
  assert.equal(tenureDays("2026-03-02", "2026-03-31"), 30);
  assert.equal(tenureLabel("2024-01-10", "2025-03-25"), "1 ano, 2 meses e 15 dias");
  assert.equal(tenureLabel("2025-11-20", "2026-01-05"), "1 mês e 16 dias");
  assert.equal(tenureLabel("2026-03-02", "2026-03-02"), "0 dia");
});

test("Retenção e experiência: desligado no próprio dia do marco não é retido", () => {
  assert.equal(retainedAt("2026-03-02", null, 45, CLT), true);
  assert.equal(retainedAt("2026-03-02", "2026-04-15", 45, CLT), false);
  assert.equal(retainedAt("2026-03-02", "2026-04-16", 45, CLT), true);
  assert.equal(terminatedDuringProbation("2026-03-02", "2026-05-30", CLT), true);
  assert.equal(terminatedDuringProbation("2026-03-02", "2026-05-31", CLT), false);
});

const E = (id: string, admission: string, termination: string | null = null, extra: Partial<EmpRec> = {}): EmpRec => ({
  id, name: id, admission, termination, terminationType: termination ? "PEDIDO_DEMISSAO" : null, unitId: "U1", unitName: "Unidade 1", departmentId: "D1", departmentName: "Recepção",
  positionId: "P1", positionTitle: "Recepcionista", managerId: null, contractType: "CLT", origin: "CADASTRO_DIRETO", ...extra,
});

test("Indicadores de permanência com registros conhecidos", () => {
  const emps = [
    E("a", "2025-06-01"), // antigo, ativo
    E("b", "2025-01-10", "2026-03-20"), // saiu em março (após a experiência)
    E("c", "2026-03-02", "2026-03-20", { terminationType: "RESCISAO_ANTECIPADA_COLABORADOR" }), // saiu na experiência (19 dias)
    E("d", "2026-03-10"), // ativo, admitido em março
    E("e", "2026-03-25", null, { unitId: "U2", unitName: "Unidade 2", positionId: "P2", positionTitle: "Camareira" }), // admitido no fim de março
  ];
  const march = { from: "2026-03-01", to: "2026-04-01" };
  // efetivo: início = a, b (c, d, e ainda não admitidos) → 2; fim = a, d, e → 3; médio 2,5
  assert.deepEqual(headcount(emps, march), { start: 2, end: 3, avg: 2.5 });
  const total = turnoverBy(emps, march, "all")[0];
  assert.equal(total.terminations, 2);
  assert.equal(total.admissions, 3);
  assert.equal(total.turnover, 2 / 2.5); // 80%
  assert.equal(total.rotatividade, (3 + 2) / 2 / 2.5); // 100%
  assert.equal(total.voluntary, 2);
  const u2 = turnoverBy(emps, march, "unit").find((r) => r.key === "U2")!;
  assert.deepEqual([u2.start, u2.end, u2.admissions, u2.terminations], [0, 1, 1, 0]);
  // retenção em 30 dias com "hoje" = 2026-04-10: c saiu antes (conta, não retido); d completou 30 dias em 08/04 (retido); e ainda não completou (fora)
  const r30 = retention(emps, march, 30, CLT, "2026-04-10");
  assert.deepEqual([r30.num, r30.den], [1, 2]);
  assert.equal(r30.excluded?.["ainda não completaram 30 dias"], 1);
  const p = probationTerminations(emps, march, CLT);
  assert.equal(p.count, 1); // só c
  assert.deepEqual([p.share.num, p.share.den], [1, 2]);
  assert.deepEqual([p.ofAdmissions.num, p.ofAdmissions.den], [1, 3]);
  const t = tenureOfLeavers(emps, march);
  assert.equal(t.n, 2);
  assert.equal(t.mean, (435 + 19) / 2); // b: 10/01/2025 → 20/03/2026 = 435 dias; c: 19 dias
});
