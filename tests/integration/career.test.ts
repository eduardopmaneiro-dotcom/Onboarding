/**
 * Fase 7 — cargos, salários e carreira contra o PostgreSQL real (SEED_DEMO=true).
 * Família, cargos, unidade e colaboradores isolados (TAG); resultados conhecidos conferidos.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../../src/lib/prisma";
import { asUser } from "../../prisma/demo-recruitment";
import { fakeCpf } from "../../prisma/demo-admission";
import { addDays, localToDate, todayKey } from "../../src/lib/datetime";
import { createDirectEmployee } from "../../src/modules/people/service";
import { savePositionSalary } from "../../src/modules/compensation/service";
import { positionDossier, publishDescriptor, saveDescriptorDraft } from "../../src/modules/career/descriptors";
import { draftFromFamily, listPaths, removeStep, savePath, saveStep, setPathStatus } from "../../src/modules/career/paths";
import { applyDueMovements, createPdi, employeeCareer, portalView, registerMovement, registerPromotionScore } from "../../src/modules/career/people";
import { addExperience, addToTalentPool, matchesForCandidate, matchesForPosition, saveCandidateProfile } from "../../src/modules/career/talent";
import { careerIndicators } from "../../src/modules/career/indicators";
import { updateSetting } from "../../src/modules/settings/service";
import { toPublicError } from "../../src/modules/shared/errors";

const TAG = Date.now().toString(36).toUpperCase().slice(-6);
const SEED = Number(Date.now().toString().slice(-7));
const status = (e: unknown) => toPublicError(e).status;
type U = Awaited<ReturnType<typeof asUser>>;
let rh: U, rhBrisa: U, gestor: U;
let familyId = "", unitId = "", deptId = "", P1 = "", P2 = "", P3 = "", pathId = "";
const E: Record<string, string> = {};
const today = todayKey();
let savedPortal: unknown;

before(async () => {
  [rh, rhBrisa, gestor] = await Promise.all(["rh@rialehoteis.com.br", "rh.brisabarra@rialehoteis.com.br", "marina.souza@rialehoteis.com.br"].map((e) => asUser(prisma, e)));
  savedPortal = (await prisma.setting.findUnique({ where: { key: "portal.faixa_salarial" } }))?.value;
  familyId = (await prisma.careerTrack.create({ data: { name: `Família Teste ${TAG}` } })).id;
  P1 = (await prisma.position.create({ data: { title: `Auxiliar Teste ${TAG}`, level: "N1", careerTrackId: familyId } })).id;
  P2 = (await prisma.position.create({ data: { title: `Atendente Teste ${TAG}`, level: "N2", careerTrackId: familyId } })).id;
  P3 = (await prisma.position.create({ data: { title: `Supervisor Teste ${TAG}`, level: "N4", careerTrackId: familyId, isLeadership: true } })).id;
  unitId = (await prisma.unit.create({ data: { name: `Carreira Teste ${TAG}`, code: `CAR_${TAG}` } })).id;
  deptId = (await prisma.department.create({ data: { name: "Recepção", unitId } })).id;
  E.A = (await createDirectEmployee(rh, { fullName: `Car A ${TAG}`, cpf: fakeCpf(SEED + 1), admissionDate: "2024-01-10", positionId: P2, departmentId: deptId, salary: "2000" })).id;
  E.B = (await createDirectEmployee(rh, { fullName: `Car B ${TAG}`, cpf: fakeCpf(SEED + 2), admissionDate: addDays(today, -120), positionId: P2, departmentId: deptId, salary: "1700" })).id;
  E.C = (await createDirectEmployee(rh, { fullName: `Car C ${TAG}`, cpf: fakeCpf(SEED + 3), admissionDate: "2025-03-01", positionId: P1, departmentId: deptId, salary: "1500" })).id;
});
after(async () => {
  if (savedPortal !== undefined) await prisma.setting.update({ where: { key: "portal.faixa_salarial" }, data: { value: savedPortal as never } });
  else await prisma.setting.deleteMany({ where: { key: "portal.faixa_salarial" } });
  await prisma.$disconnect();
});

test("Descritivo: rascunho, publicação com origem obrigatória, versões, superior e subordinados", async () => {
  await assert.rejects(saveDescriptorDraft(gestor, P3, { objective: "x" }), (e) => status(e) === 403);
  await assert.rejects(saveDescriptorDraft(rhBrisa, P3, { objective: "x" }), (e) => status(e) === 403); // corporativo
  await assert.rejects(saveDescriptorDraft(rh, P3, { minRequirements: "Liderança", competencies: "liderança" }), /requisito mínimo e como item desenvolvível/);
  await saveDescriptorDraft(rh, P3, { objective: "Coordenar a equipe.", responsibilities: "Escala\n- Indicadores", minRequirements: "Ensino médio completo", education: "MEDIO", minExperienceMonths: "24", competencies: "Liderança\nComunicação" });
  await assert.rejects(publishDescriptor(rh, P3, {}), /documento institucional de origem/);
  await saveDescriptorDraft(rh, P3, { objective: "Coordenar a equipe.", responsibilities: "Escala\n- Indicadores", minRequirements: "Ensino médio completo", education: "MEDIO", minExperienceMonths: "24", competencies: "Liderança\nComunicação", sourceRef: `Documento ${TAG}` });
  await publishDescriptor(rh, P3, { effectiveFrom: "2026-01-01" });
  await saveDescriptorDraft(rh, P2, { objective: "Atender hóspedes.", responsibilities: "Atendimento", minRequirements: "Ensino médio completo", competencies: "Comunicação", reportsToId: P3, sourceRef: `Documento ${TAG}` });
  await publishDescriptor(rh, P2, {});
  // nova versão do P3: v1 arquivada, v2 vigente
  await saveDescriptorDraft(rh, P3, { objective: "Coordenar a equipe e os indicadores.", responsibilities: "Escala", minRequirements: "Ensino médio completo", education: "MEDIO", minExperienceMonths: "24", competencies: "Liderança\nComunicação", sourceRef: `Documento ${TAG} v2` });
  await publishDescriptor(rh, P3, {});
  const d = await positionDossier(gestor, P3); // gestor vê o descritivo
  assert.deepEqual(d.versions.map((v) => [v.version, v.status]), [[2, "VIGENTE"], [1, "ARQUIVADO"]]);
  assert.deepEqual(d.current!.responsibilities, ["Escala"]);
  assert.deepEqual(d.subordinates.map((s) => s.id), [P2]);
  assert.deepEqual((await positionDossier(rh, P2)).current!.responsibilities, ["Atendimento"]);
});

test("Trilha: configurável, rascunho a partir do catálogo, validações e publicação", async () => {
  const draft = await draftFromFamily(rh, familyId);
  const drafts = await listPaths(rh, { includeDrafts: true });
  assert.deepEqual(drafts.find((p) => p.id === draft.id)!.steps.map((s) => s.positionId), [P1, P2, P3]); // ordem por nível
  assert.ok(!(await listPaths(gestor)).some((p) => p.id === draft.id), "rascunho não aparece para quem não edita");
  await setPathStatus(rh, draft.id, "ARQUIVADO");
  pathId = (await savePath(rh, { name: `Trilha ${TAG}`, familyId })).id;
  await saveStep(rh, { pathId, positionId: P1 });
  await assert.rejects(setPathStatus(rh, pathId, "VIGENTE"), /pelo menos 2 cargos/);
  await saveStep(rh, { pathId, positionId: P2, minMonths: "6" });
  await assert.rejects(saveStep(rh, { pathId, positionId: P2 }), /já está na trilha/);
  await assert.rejects(saveStep(rh, { pathId, positionId: P3, requirements: "Liderança", developable: "liderança" }), /não pode ser requisito mínimo e item do PDI/);
  const s3 = await saveStep(rh, { pathId, positionId: P3, minMonths: "18", requirements: "Sem advertências em 12 meses", developable: "Liderança" });
  await assert.rejects(setPathStatus(rh, pathId, "VIGENTE"), /documento institucional/);
  await savePath(rh, { id: pathId, name: `Trilha ${TAG}`, familyId, sourceRef: `Documento ${TAG}` });
  await setPathStatus(rh, pathId, "VIGENTE");
  assert.equal(s3.order, 3);
  const tmp = await saveStep(rh, { pathId, positionId: (await prisma.position.findUniqueOrThrow({ where: { title: "Mensageiro" } })).id });
  await removeStep(rh, tmp.id);
  const p = (await listPaths(gestor)).find((x) => x.id === pathId)!;
  assert.deepEqual(p.steps.map((s) => [s.order, s.positionId]), [[1, P1], [2, P2], [3, P3]]);
});

test("Elegibilidade (RH-CAR-01): tempo + nota; avaliação ponderada; não é promoção automática", async () => {
  await assert.rejects(registerPromotionScore(gestor, E.A, { cycle: "2026-S1", performance: 80, competency: 80, behavior: 80, culturalFit: 80, leadershipPotential: 80, pdiCompletion: 80, conduct: 80 }), (e) => status(e) === 403);
  const s = await registerPromotionScore(rh, E.A, { cycle: "2026-S1", performance: 80, competency: 70, behavior: 90, culturalFit: 100, leadershipPotential: 50, pdiCompletion: 60, conduct: 100 });
  assert.equal(s.totalScore, 78.5);
  assert.equal(s.committeeRequired, true);
  await assert.rejects(registerPromotionScore(rh, E.A, { cycle: "2026-S1", performance: 1, competency: 1, behavior: 1, culturalFit: 1, leadershipPotential: 1, pdiCompletion: 1, conduct: 1 }), /Já existe avaliação neste ciclo/);
  const a = await employeeCareer(rh, E.A);
  assert.equal(a.next[0].next!.positionId, P3);
  assert.equal(a.next[0].eligibility.status, "ELEGIVEL"); // > 18 meses e nota 78,5 ≥ 70
  const b = await employeeCareer(rh, E.B);
  assert.equal(b.next[0].eligibility.status, "FALTA_TEMPO");
  assert.equal(b.next[0].eligibility.missingMonths, 18 - b.next[0].eligibility.monthsInRole);
  const c = await employeeCareer(rh, E.C);
  assert.equal(c.next[0].eligibility.status, "FALTA_AVALIACAO");
  assert.equal(c.salary?.base, 1500);
});

test("Movimentações: promoção validada, faixa, vaga interna, histórico e agendamento", async () => {
  await savePositionSalary(rh, { positionId: P3, baseSalary: "3000", minSalary: "2700", maxSalary: "3600", effectiveFrom: "2026-01-01" });
  await assert.rejects(savePositionSalary(rh, { positionId: P3, baseSalary: "3000", minSalary: "3100", effectiveFrom: "2026-01-01" }), /mínimo da faixa/);
  const job = await prisma.jobOpening.create({ data: { code: `CAR-${TAG}`, positionId: P3, departmentId: deptId, headcount: 1, status: "ABERTA", openedAt: localToDate(addDays(today, -30)) } });
  await assert.rejects(registerMovement(rh, E.C, { type: "PROMOCAO", effectiveDate: today, toPositionId: (await prisma.position.findUniqueOrThrow({ where: { title: "Mensageiro" } })).id, reason: "Teste de promoção" }), /nível superior ou o próximo passo/);
  await assert.rejects(registerMovement(rh, E.A, { type: "PROMOCAO", effectiveDate: today, toPositionId: P3, newSalary: "2500", reason: "Promoção ao supervisor" }), /abaixo do mínimo da faixa/);
  await assert.rejects(registerMovement(gestor, E.A, { type: "PROMOCAO", effectiveDate: today, toPositionId: P3, reason: "Promoção ao supervisor" }), (e) => status(e) === 403);
  await registerMovement(rh, E.A, { type: "PROMOCAO", effectiveDate: today, toPositionId: P3, newSalary: "3.000,00", reason: "Promoção ao supervisor (comitê 2026-S1)", jobOpeningId: job.id });
  const emp = await prisma.employee.findUniqueOrThrow({ where: { id: E.A } });
  assert.equal(emp.positionId, P3);
  assert.equal((await prisma.jobOpening.findUniqueOrThrow({ where: { id: job.id } })).status, "PREENCHIDA");
  const a = await employeeCareer(rh, E.A);
  assert.equal(a.since, today);
  assert.equal(a.salary?.base, 3000);
  assert.equal(a.salary?.position?.where, "DENTRO");
  assert.deepEqual(a.movements.map((m) => m.type), ["ADMISSAO", "PROMOCAO"]);
  // transferência com data futura: só vale quando a data chega
  const dept2 = (await prisma.department.create({ data: { name: "Governança", unitId } })).id;
  await registerMovement(rh, E.C, { type: "TRANSFERENCIA_DEPARTAMENTO", effectiveDate: addDays(today, 10), toDepartmentId: dept2, reason: "Remanejamento planejado" });
  assert.equal((await prisma.employee.findUniqueOrThrow({ where: { id: E.C } })).departmentId, deptId);
  await applyDueMovements(addDays(today, 10));
  assert.equal((await prisma.employee.findUniqueOrThrow({ where: { id: E.C } })).departmentId, dept2);
});

test("Portal do colaborador: requisitos mínimos × PDI separados; faixa conforme política; sem promessa", async () => {
  await createPdi(rh, E.B, { gapDescription: "Liderança", developmentGoal: "Conduzir a passagem de turno", recommendedAction: "Acompanhamento do supervisor", dueDate: addDays(today, 90) });
  await updateSetting(rh, "portal.faixa_salarial", "NAO_EXIBIR");
  let v = await portalView(E.B);
  assert.equal(v.currentBand, null);
  assert.equal(v.next[0].band, null);
  assert.match(v.disclaimer, /não é automática/);
  assert.deepEqual(v.next[0].mustHave.progression, ["Sem advertências em 12 meses"]);
  assert.deepEqual(v.next[0].mustHave.descriptor, ["Ensino médio completo"]);
  assert.ok(v.next[0].develop.includes("Liderança") && !v.next[0].mustHave.progression.includes("Liderança"));
  assert.equal(v.pdis.length, 1);
  await updateSetting(rh, "portal.faixa_salarial", "FAIXA");
  v = await portalView(E.B);
  assert.deepEqual(v.next[0].band, { min: 2700, ref: 3000, max: 3600 });
  assert.ok(!JSON.stringify(v).includes("1700"), "salário individual não aparece no portal");
  await assert.rejects(updateSetting(rhBrisa, "portal.faixa_salarial", "REFERENCIA"), (e) => status(e) === 403);
});

test("Potencial de candidatos e banco de talentos", async () => {
  const cand = await prisma.candidate.create({ data: { fullName: `Talento ${TAG}`, nameNormalized: `talento ${TAG.toLowerCase()}` } });
  await saveCandidateProfile(rh, cand.id, { education: "MEDIO", competencies: "liderança, Comunicação" });
  await addExperience(rh, cand.id, { roleTitle: "Atendente", positionId: P2, months: "30", company: "Hotel X" });
  const m = await matchesForCandidate(rh, cand.id);
  const sup = m.find((x) => x.positionId === P3)!;
  assert.equal(sup.level, "FORTE"); // 30 meses no cargo anterior da trilha ≥ 24, médio completo
  assert.deepEqual(sup.competencyMatches.sort(), ["Comunicação", "Liderança"]);
  assert.ok(m.some((x) => x.positionId === P2 && x.level === "FORTE"));
  await addToTalentPool(rh, { candidateId: cand.id, positionId: P3, reason: "30 meses de atendimento, liderança" });
  await assert.rejects(addToTalentPool(rh, { candidateId: cand.id, positionId: P3, reason: "Repetido aqui" }), /já está no banco/);
  const byPos = await matchesForPosition(rh, P3);
  assert.ok(byPos.some((x) => x.candidateId === cand.id && x.pool?.status === "ATIVO"));
  assert.ok((await prisma.candidateEvent.findMany({ where: { candidateId: cand.id } })).some((e) => e.summary.startsWith("Incluído no banco de talentos")));
  await assert.rejects(addToTalentPool(gestor, { candidateId: cand.id, positionId: P2, reason: "Gestor tentando" }), (e) => status(e) === 403);
});

test("Indicadores: elegibilidade, promoções, distribuição, sucessores e preenchimento interno", async () => {
  const r = await careerIndicators(rh, { gran: "ano", ref: today, unidade: unitId, familia: familyId });
  assert.equal(r.promotions.count, 1);
  assert.deepEqual([r.internalFill.rate.num, r.internalFill.rate.den], [1, 1]);
  const sup = r.successors.find((s) => s.positionId === P3)!;
  assert.equal(sup.incumbents, 1); // A promovido
  assert.deepEqual(sup.developing.map((x) => x.id), [E.B]); // B ainda não cumpre o tempo
  assert.equal(r.eligibility.counts.FALTA_TEMPO, 1); // B
  assert.equal(r.eligibility.counts.FALTA_AVALIACAO, 1); // C
  const dist = r.distribution!.find((d) => d.positionId === P3)!;
  assert.deepEqual([dist.n, dist.within, dist.below, dist.avgCompa], [1, 1, 0, 1]);
  const g = await careerIndicators(gestor, { gran: "ano", ref: today });
  assert.equal(g.distribution, null, "gestor não vê distribuição salarial");
});
