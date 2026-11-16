import { test } from "node:test";
import assert from "node:assert/strict";
import { bandPosition, candidateFit, eligibility, meetsEducation, monthsBetween, promotionTotal, PROMOTION_WEIGHTS } from "../../src/modules/career/rules";

test("RH-CAR-01: pesos somam 100 e nota ponderada", () => {
  assert.equal(Object.values(PROMOTION_WEIGHTS).reduce((s, w) => s + w.weight, 0), 100);
  assert.equal(promotionTotal({ performance: 80, competency: 70, behavior: 90, culturalFit: 100, leadershipPotential: 50, pdiCompletion: 60, conduct: 100 }), 78.5); // 20 + 14 + 13,5 + 10 + 5 + 6 + 10
  assert.equal(promotionTotal({ performance: 150, competency: -5, behavior: 0, culturalFit: 0, leadershipPotential: 0, pdiCompletion: 0, conduct: 0 }), 25); // limitado a 0–100
});

test("Tempo no cargo e elegibilidade (não é promoção automática)", () => {
  assert.equal(monthsBetween("2025-03-15", "2026-03-14"), 11);
  assert.equal(monthsBetween("2025-03-15", "2026-03-15"), 12);
  assert.equal(eligibility("2025-03-15", "2026-01-10", 12, 85, 70).status, "FALTA_TEMPO");
  assert.equal(eligibility("2025-03-15", "2026-01-10", 12, 85, 70).missingMonths, 3);
  assert.equal(eligibility("2024-01-01", "2026-01-10", 12, null, 70).status, "FALTA_AVALIACAO");
  assert.equal(eligibility("2024-01-01", "2026-01-10", 12, 69.9, 70).status, "NOTA_ABAIXO");
  assert.equal(eligibility("2024-01-01", "2026-01-10", 12, 70, 70).status, "ELEGIVEL");
  assert.equal(eligibility("2026-01-01", "2026-01-10", null, 90, 70).status, "ELEGIVEL");
});

test("Escolaridade e posição na faixa salarial", () => {
  assert.equal(meetsEducation("MEDIO", "MEDIO"), true);
  assert.equal(meetsEducation("FUNDAMENTAL", "MEDIO"), false);
  assert.equal(meetsEducation(null, "MEDIO"), null);
  assert.equal(meetsEducation(null, "NAO_EXIGIDA"), true);
  assert.deepEqual(bandPosition(2000, { min: 1800, ref: 2000, max: 2400 }), { compa: 1, where: "DENTRO", penetration: 33.3 });
  assert.equal(bandPosition(1700, { min: 1800, ref: 2000, max: 2400 })!.where, "ABAIXO");
  assert.equal(bandPosition(2500, { min: 1800, ref: 2000, max: 2400 })!.where, "ACIMA");
  assert.equal(bandPosition(2100, { min: null, ref: 2000, max: null })!.penetration, null);
  assert.equal(bandPosition(null, { min: 1, ref: 2, max: 3 }), null);
});

test("Potencial do candidato por evidências", () => {
  const target = { positionId: "SUP", feederIds: ["REC"], familyIds: ["MENS", "REC", "SUP"], education: "MEDIO" as const, minExperienceMonths: 24, competencies: ["Liderança", "Comunicação"] };
  const strong = candidateFit({ experiences: [{ positionId: "REC", months: 30 }], education: "MEDIO", competencies: ["liderança"], rhApprovedFor: [] }, target);
  assert.equal(strong.level, "FORTE");
  assert.deepEqual(strong.competencyMatches, ["Liderança"]);
  const partial = candidateFit({ experiences: [{ positionId: "REC", months: 10 }], education: "MEDIO", competencies: [], rhApprovedFor: [] }, target);
  assert.equal(partial.level, "PARCIAL");
  const lowEdu = candidateFit({ experiences: [{ positionId: "SUP", months: 40 }], education: "FUNDAMENTAL", competencies: [], rhApprovedFor: [] }, target);
  assert.equal(lowEdu.level, "PARCIAL");
  assert.ok(lowEdu.evidence.includes("escolaridade abaixo da exigida"));
  assert.equal(candidateFit({ experiences: [], education: null, competencies: [], rhApprovedFor: ["SUP"] }, target).level, "FORTE");
  assert.equal(candidateFit({ experiences: [{ positionId: "OUTRO", months: 50 }], education: "SUPERIOR", competencies: [], rhApprovedFor: [] }, target).level, null);
});
