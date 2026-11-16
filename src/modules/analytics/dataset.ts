import { prisma } from "@/lib/prisma";
import { assertCan, type CurrentUser } from "@/lib/session";
import { jobScopeWhere } from "@/modules/recruitment/scope";
import type { CandRec, Dataset, Dims, IvRec, ReviewRec } from "@/modules/analytics/metrics";

/** Nome da recrutadora: usuário vinculado ou, no histórico importado, o primeiro nome registrado ("Sara / Aline" → "Sara"). */
export function recruiterName(userName: string | null | undefined, text: string | null | undefined): string {
  if (userName) return userName;
  const t = (text ?? "").split("/")[0].trim();
  return t || "Não informado";
}

/**
 * Carrega a base de indicadores no escopo do usuário (gestor: as próprias vagas; RH de unidade: a unidade).
 * Inclui o histórico importado, marcado como `historical` (entra nas contagens; fica fora dos SLAs).
 */
export async function loadDataset(user: CurrentUser): Promise<Dataset> {
  assertCan(user, "relatorios.view");
  const jobs = await prisma.jobOpening.findMany({
    where: jobScopeWhere(user),
    include: {
      position: { select: { id: true, title: true } },
      department: { include: { unit: { select: { id: true, name: true } }, managers: { where: { active: true }, select: { id: true, name: true } } } },
      requestingManager: { select: { id: true, name: true } },
      applications: {
        include: {
          candidate: { select: { id: true, fullName: true } },
          interviews: { include: { interviewerUser: { select: { name: true } }, reason: { select: { label: true } } } },
          managerReviews: { include: { manager: { select: { id: true, name: true } } } },
        },
      },
    },
  });

  const out: Dataset = { jobs: [], apps: [], interviews: [], reviews: [], candidates: [] };
  for (const j of jobs) {
    const mgr = j.requestingManager ?? (j.department.managers.length === 1 ? j.department.managers[0] : null);
    const dims: Dims = {
      unitId: j.department.unit.id, unitName: j.department.unit.name,
      departmentId: j.departmentId, departmentName: j.department.name,
      positionId: j.positionId, positionTitle: j.position.title,
      managerId: mgr?.id ?? null, managerName: mgr?.name ?? null,
      historical: j.isHistorical,
    };
    let firstInterviewAt: Date | null = null;
    for (const a of j.applications) {
      const ivs: IvRec[] = a.interviews.map((i) => ({
        ...dims, id: i.id, applicationId: a.id, jobId: j.id, candidateId: a.candidateId, candidateName: a.candidate.fullName,
        scheduledAt: i.scheduledAt, status: i.status, result: i.result, resultAt: i.resultAt, stage: i.stage, reason: i.reason?.label ?? null,
        recruiter: recruiterName(i.interviewerUser?.name, i.interviewerName),
      }));
      for (const i of ivs) if (i.status !== "CANCELADA" && (!firstInterviewAt || i.scheduledAt < firstInterviewAt)) firstInterviewAt = i.scheduledAt;
      const revs: ReviewRec[] = a.managerReviews.map((r) => ({
        ...dims, id: r.id, applicationId: a.id, candidateName: a.candidate.fullName, status: r.status, requestedAt: r.requestedAt, decidedAt: r.decidedAt, onBehalf: r.onBehalf,
        reviewManagerId: r.manager?.id ?? null, reviewManagerName: r.manager?.name ?? null,
      }));
      out.interviews.push(...ivs);
      out.reviews.push(...revs);
      out.apps.push({
        ...dims, id: a.id, jobId: j.id, jobCode: j.code, jobOpenedAt: j.openedAt, candidateId: a.candidateId, candidateName: a.candidate.fullName,
        status: a.status, approvedAt: a.approvedAt, hiredAt: a.hiredAt, interviews: ivs.filter((i) => i.status !== "CANCELADA"), reviews: revs,
      });
    }
    out.jobs.push({ ...dims, id: j.id, code: j.code, status: j.status, openedAt: j.openedAt, closedAt: j.closedAt, headcount: j.headcount, firstInterviewAt });
  }

  // Candidatos: entrada = cadastro; no histórico importado, a data da 1ª entrevista (o cadastro foi o dia da importação)
  const candIds = [...new Set(out.apps.map((a) => a.candidateId))];
  const scopeAll = user.role === "ADMIN" || (user.role === "RH" && !user.unitId);
  const cands = await prisma.candidate.findMany({
    where: scopeAll ? { anonymizedAt: null } : { id: { in: candIds } },
    select: { id: true, createdAt: true, importBatchId: true, applications: { select: { jobOpeningId: true } } },
  });
  const firstIv = new Map<string, Date>();
  for (const i of out.interviews) { const cur = firstIv.get(i.candidateId); if (!cur || i.scheduledAt < cur) firstIv.set(i.candidateId, i.scheduledAt); }
  out.candidates = cands.map<CandRec>((c) => ({ id: c.id, entryAt: c.importBatchId ? (firstIv.get(c.id) ?? c.createdAt) : c.createdAt, jobIds: c.applications.map((x) => x.jobOpeningId) }));
  return out;
}

/** Opções dos filtros a partir da própria base (só aparece o que existe no escopo). */
export function filterOptions(ds: Dataset) {
  const uniq = <T extends { value: string }>(xs: T[]) => [...new Map(xs.map((x) => [x.value, x])).values()].sort((a, b) => (a as unknown as { label: string }).label.localeCompare((b as unknown as { label: string }).label));
  return {
    units: uniq(ds.jobs.map((j) => ({ value: j.unitId, label: j.unitName }))),
    departments: uniq(ds.jobs.map((j) => ({ value: j.departmentName, label: j.departmentName }))),
    positions: uniq(ds.jobs.map((j) => ({ value: j.positionId, label: j.positionTitle }))),
    recruiters: uniq(ds.interviews.map((i) => ({ value: i.recruiter, label: i.recruiter }))),
    managers: uniq(ds.jobs.filter((j) => j.managerId).map((j) => ({ value: j.managerId as string, label: j.managerName as string }))),
  };
}
