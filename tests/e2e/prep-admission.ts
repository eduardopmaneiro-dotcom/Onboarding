/** Preparação do E2E da admissão: um candidato com aprovação final (RH + gestor) numa vaga de demonstração. */
import { prisma } from "../../src/lib/prisma";
import { addDays, localToDate, todayKey } from "../../src/lib/datetime";

async function main() {
  const run = process.argv[2] ?? Date.now().toString(36).toUpperCase();
  const today = todayKey();
  const job = await prisma.jobOpening.findFirstOrThrow({ where: { isHistorical: false, position: { title: "Recepcionista" }, department: { name: "Recepção", unit: { code: "BRISA" } } }, include: { requestingManager: true } });
  const c = await prisma.candidate.create({ data: { fullName: `Helena Prado ${run}`, nameNormalized: `helena prado ${run.toLowerCase()}`, phone: "21977776666" } });
  const a = await prisma.application.create({ data: { candidateId: c.id, jobOpeningId: job.id, status: "APROVADO", approvedAt: localToDate(addDays(today, -1), "10:00"), offeredSalary: 2200 } });
  const iv = await prisma.interview.create({ data: { applicationId: a.id, scheduledAt: localToDate(addDays(today, -3), "09:00"), interviewerName: "Carla Mendes", status: "REALIZADA", result: "APROVADO", resultAt: localToDate(addDays(today, -3), "10:00") } });
  await prisma.managerReview.create({ data: { applicationId: a.id, managerId: job.requestingManagerId!, status: "APROVADO", requestedAt: localToDate(addDays(today, -3), "10:00"), decidedAt: localToDate(addDays(today, -1), "10:00") } });
  await prisma.candidateEvent.createMany({ data: [
    { candidateId: c.id, applicationId: a.id, interviewId: iv.id, type: "RESULTADO_RH", summary: "Aprovado pelo RH (1ª entrevista)" },
    { candidateId: c.id, applicationId: a.id, type: "DECISAO_GESTOR", summary: `Aprovado pelo gestor (${job.requestingManager?.name})` },
  ] });
  console.log(JSON.stringify({ candidateId: c.id, name: c.fullName }));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
