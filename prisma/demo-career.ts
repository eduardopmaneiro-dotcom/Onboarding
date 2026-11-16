/**
 * Carreira de demonstração — CONTEÚDO FICTÍCIO, apenas com SEED_DEMO (nunca em produção).
 * Em produção, descritivos e trilhas vêm dos documentos institucionais cadastrados pelo RH.
 */
import type { PrismaClient } from "@prisma/client";
import { asUser } from "./demo-recruitment";
import { publishDescriptor, saveDescriptorDraft } from "../src/modules/career/descriptors";
import { savePath, saveStep, setPathStatus } from "../src/modules/career/paths";
import { registerPromotionScore } from "../src/modules/career/people";
import { addExperience, addToTalentPool, saveCandidateProfile } from "../src/modules/career/talent";
import { savePositionSalary } from "../src/modules/compensation/service";

const DEMO = "DEMONSTRAÇÃO — conteúdo fictício";

export async function simulateCareer(prisma: PrismaClient) {
  const rh = await asUser(prisma, "rh@rialehoteis.com.br");
  const pos = async (t: string) => (await prisma.position.findUniqueOrThrow({ where: { title: t } })).id;
  const [mens, rec, sup] = await Promise.all([pos("Mensageiro"), pos("Recepcionista"), pos("Supervisor de Recepção")]);
  const desc = [
    [mens, { objective: "Apoiar a recepção no transporte de bagagens e orientação de hóspedes.", responsibilities: "Conduzir hóspedes às UHs\nTransportar bagagens", minRequirements: "Ensino fundamental completo", education: "FUNDAMENTAL", competencies: "Cordialidade\nComunicação", reportsToId: sup }],
    [rec, { objective: "Realizar check-in e check-out e atender hóspedes com padrão de serviço.", responsibilities: "Check-in e check-out\nAtendimento telefônico\nFechamento de caixa", minRequirements: "Ensino médio completo\nDisponibilidade para escala 12x36", education: "MEDIO", minExperienceMonths: "6", experienceNote: "atendimento ao público", technicalRequired: "Informática básica", technicalDevelopable: "Sistema de gestão hoteleira\nInglês intermediário", competencies: "Comunicação\nResolução de problemas", reportsToId: sup }],
    [sup, { objective: "Coordenar a equipe de recepção e garantir o padrão de atendimento.", responsibilities: "Escala da equipe\nTratamento de reclamações\nIndicadores da recepção", minRequirements: "Ensino médio completo\nExperiência em recepção hoteleira", education: "MEDIO", minExperienceMonths: "24", technicalRequired: "Sistema de gestão hoteleira", competencies: "Liderança\nComunicação\nGestão de conflitos" }],
  ] as const;
  for (const [id, d] of desc) {
    await saveDescriptorDraft(rh, id, { ...d, sourceRef: DEMO });
    await publishDescriptor(rh, id, { effectiveFrom: "2026-01-01" });
  }
  const family = await prisma.careerTrack.findUniqueOrThrow({ where: { name: "Recepção e Portaria" } });
  const path = await savePath(rh, { name: "Recepção (demonstração)", familyId: family.id, sourceRef: DEMO, description: "Trilha fictícia para demonstrar o módulo." });
  await saveStep(rh, { pathId: path.id, positionId: mens });
  await saveStep(rh, { pathId: path.id, positionId: rec, minMonths: "6", requirements: "Ensino médio completo", developable: "Sistema de gestão hoteleira" });
  await saveStep(rh, { pathId: path.id, positionId: sup, minMonths: "18", requirements: "Avaliação de desempenho satisfatória nos últimos 2 ciclos", developable: "Liderança\nGestão de conflitos" });
  await setPathStatus(rh, path.id, "VIGENTE");
  await savePositionSalary(rh, { positionId: rec, baseSalary: "2150", minSalary: "1950", maxSalary: "2600", effectiveFrom: "2026-02-01", note: DEMO });
  await savePositionSalary(rh, { positionId: sup, baseSalary: "3400", minSalary: "3000", maxSalary: "4200", effectiveFrom: "2026-02-01", note: DEMO });

  const recs = await prisma.employee.findMany({ where: { positionId: rec, status: { not: "DESLIGADO" } }, orderBy: { admissionDate: "asc" } });
  const scores = [82, 64];
  for (const [i, e] of recs.slice(0, 2).entries()) await registerPromotionScore(rh, e.id, { cycle: "2026-S1", performance: scores[i], competency: scores[i], behavior: scores[i], culturalFit: scores[i], leadershipPotential: scores[i], pdiCompletion: scores[i], conduct: scores[i], decision: DEMO });

  // candidato do recrutamento simulado com perfil compatível com outra posição
  const cand = await prisma.candidate.findFirst({ where: { applications: { some: { status: "REPROVADO", jobOpening: { positionId: rec } } } } });
  if (cand) {
    await saveCandidateProfile(rh, cand.id, { education: "MEDIO", competencies: "Liderança, Comunicação" });
    await addExperience(rh, cand.id, { roleTitle: "Recepcionista", positionId: rec, company: "Hotel fictício", months: "30" });
    await addToTalentPool(rh, { candidateId: cand.id, positionId: sup, reason: `30 meses como recepcionista; liderança (${DEMO})` });
  }
  return { descriptors: desc.length, paths: 1 };
}
