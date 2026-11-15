import { z } from "zod";
import { ContractType, JobOpeningReason, JobOpeningStatus, Prisma, WorkSchedule, WorkShift } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { assertCan, type CurrentUser } from "@/lib/session";
import { localToDate, todayKey } from "@/lib/datetime";
import { parseMoney } from "@/lib/text";
import { NotFoundError, ValidationError } from "@/modules/shared/errors";
import { assertUnitInScope, unitScope } from "@/modules/shared/scope";
import { jobScopeWhere } from "@/modules/recruitment/scope";

const money = z.preprocess((v) => (v === "" || v === undefined || v === null ? undefined : parseMoney(v)), z.number().min(0, "Valor inválido").max(1_000_000).optional());
const optInt = (min: number, max: number) => z.preprocess((v) => (v === "" || v === undefined || v === null ? undefined : Number(v)), z.number().int().min(min).max(max).optional());

export const jobInput = z.object({
  positionId: z.string({ error: "Selecione o cargo" }).min(1, "Selecione o cargo"),
  departmentId: z.string({ error: "Selecione o departamento" }).min(1, "Selecione o departamento"),
  requestingManagerId: z.string().min(1).optional().nullable(),
  headcount: z.preprocess((v) => (v === "" || v === undefined ? 1 : Number(v)), z.number().int().min(1, "Mínimo 1").max(100)),
  openedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida").optional(),
  expectedSalary: money,
  schedule: z.enum(WorkSchedule).optional(),
  shift: z.enum(WorkShift).optional(),
  weeklyHours: optInt(1, 60),
  workHours: z.string().trim().max(60).optional(),
  status: z.enum(JobOpeningStatus).optional(),
  reason: z.enum(JobOpeningReason).optional(),
  contractType: z.enum(ContractType).optional(),
  description: z.string().trim().max(4000).optional(),
});

export async function nextJobCode(tx: Prisma.TransactionClient | typeof prisma, year: number): Promise<string> {
  const [{ n }] = await tx.$queryRaw<Array<{ n: bigint }>>`SELECT nextval('job_opening_code_seq') AS n`;
  return `VAG-${year}-${String(n).padStart(4, "0")}`;
}

async function resolveManager(departmentId: string, managerId?: string | null) {
  const dept = await prisma.department.findFirst({ where: { id: departmentId, active: true }, include: { managers: { where: { active: true }, select: { id: true } } } });
  if (!dept) throw new ValidationError("Departamento inexistente ou inativo", { departmentId: ["Departamento inválido"] });
  if (managerId) {
    const m = await prisma.manager.findFirst({ where: { id: managerId, active: true }, include: { department: true } });
    if (!m) throw new ValidationError("Gestor não encontrado", { requestingManagerId: ["Gestor inválido"] });
    if (m.department.unitId !== dept.unitId) throw new ValidationError("O gestor deve ser da mesma unidade da vaga", { requestingManagerId: ["Gestor de outra unidade"] });
    return { dept, managerId };
  }
  // Sem escolha explícita: se o departamento tem um único gestor, ele é o responsável
  return { dept, managerId: dept.managers.length === 1 ? dept.managers[0].id : null };
}

export async function createJob(user: CurrentUser, raw: unknown) {
  assertCan(user, "recrutamento.manage");
  const data = jobInput.parse(raw);
  const { dept, managerId } = await resolveManager(data.departmentId, data.requestingManagerId);
  assertUnitInScope(user, dept.unitId);
  const opened = localToDate(data.openedAt ?? todayKey(), "12:00");
  const job = await prisma.$transaction(async (tx) => {
    const code = await nextJobCode(tx, Number((data.openedAt ?? todayKey()).slice(0, 4)));
    return tx.jobOpening.create({
      data: {
        code,
        positionId: data.positionId,
        departmentId: data.departmentId,
        requestingManagerId: managerId,
        headcount: data.headcount,
        openedAt: opened,
        expectedSalary: data.expectedSalary ?? null,
        schedule: data.schedule ?? null,
        shift: data.shift ?? null,
        weeklyHours: data.weeklyHours ?? null,
        workHours: data.workHours ?? null,
        status: data.status ?? "ABERTA",
        reason: data.reason ?? "SUBSTITUICAO",
        contractType: data.contractType ?? "CLT",
        description: data.description ?? null,
        createdById: user.id,
      },
    });
  });
  await recordAudit({ entityType: "JobOpening", entityId: job.id, action: "CREATE", actorId: user.id, actorRole: user.role, newValue: job });
  return job;
}

export async function updateJob(user: CurrentUser, jobId: string, raw: unknown) {
  assertCan(user, "recrutamento.manage");
  const before = await prisma.jobOpening.findFirst({ where: { id: jobId, ...jobScopeWhere(user) } });
  if (!before) throw new NotFoundError("Vaga não encontrada");
  const data = jobInput.partial().parse(raw);
  let managerId = before.requestingManagerId;
  if (data.departmentId || data.requestingManagerId !== undefined) {
    const r = await resolveManager(data.departmentId ?? before.departmentId, data.requestingManagerId);
    assertUnitInScope(user, r.dept.unitId);
    managerId = r.managerId;
  }
  const closing = data.status && ["PREENCHIDA", "CANCELADA", "ENCERRADA"].includes(data.status);
  const job = await prisma.jobOpening.update({
    where: { id: jobId },
    data: {
      ...data,
      openedAt: data.openedAt ? localToDate(data.openedAt, "12:00") : undefined,
      requestingManagerId: managerId,
      closedAt: closing ? (before.closedAt ?? new Date()) : data.status ? null : undefined,
    },
  });
  await recordAudit({ entityType: "JobOpening", entityId: job.id, action: data.status && data.status !== before.status ? "STATUS_CHANGE" : "UPDATE", actorId: user.id, actorRole: user.role, previousValue: before, newValue: job });
  return job;
}

export async function listJobs(user: CurrentUser, f: { status?: string; unitId?: string; q?: string; includeHistorical?: boolean } = {}) {
  assertCan(user, "vagas.view");
  const scope = unitScope(user);
  const where: Prisma.JobOpeningWhereInput = {
    AND: [
      jobScopeWhere(user),
      f.status === "ativas" || !f.status ? { status: { in: ["ABERTA", "PAUSADA", "RASCUNHO", "AGUARDANDO_APROVACAO"] } } : f.status === "todas" ? {} : { status: f.status as JobOpeningStatus },
      f.unitId && !scope ? { department: { unitId: f.unitId } } : {},
      f.includeHistorical ? {} : { isHistorical: false },
      f.q ? { OR: [{ code: { contains: f.q, mode: "insensitive" } }, { position: { title: { contains: f.q, mode: "insensitive" } } }] } : {},
    ],
  };
  const jobs = await prisma.jobOpening.findMany({
    where,
    orderBy: [{ status: "asc" }, { openedAt: "desc" }],
    include: {
      position: { select: { title: true } },
      department: { select: { name: true, unit: { select: { id: true, name: true } } } },
      requestingManager: { select: { id: true, name: true } },
      applications: { select: { status: true } },
    },
  });
  return jobs.map((j) => ({
    ...j,
    counts: {
      total: j.applications.length,
      emProcesso: j.applications.filter((a) => ["TRIAGEM", "ENTREVISTA", "AVALIACAO", "AGUARDANDO_GESTOR", "PROPOSTA"].includes(a.status)).length,
      aprovados: j.applications.filter((a) => ["APROVADO", "CONTRATADO"].includes(a.status)).length,
      aguardandoGestor: j.applications.filter((a) => a.status === "AGUARDANDO_GESTOR").length,
    },
  }));
}

export async function getJob(user: CurrentUser, jobId: string) {
  const job = await prisma.jobOpening.findFirst({
    where: { id: jobId, ...jobScopeWhere(user) },
    include: {
      position: true,
      department: { include: { unit: true } },
      requestingManager: { select: { id: true, name: true, email: true } },
      applications: {
        orderBy: { updatedAt: "desc" },
        include: {
          candidate: { select: { id: true, fullName: true, phone: true, email: true } },
          interviews: { orderBy: { scheduledAt: "desc" }, include: { reason: true, interviewerUser: { select: { name: true } } } },
          managerReviews: { orderBy: { requestedAt: "desc" }, take: 1, include: { manager: { select: { name: true } } } },
        },
      },
    },
  });
  if (!job) throw new NotFoundError("Vaga não encontrada");
  return job;
}

/** Dados para os formulários: tudo vem da estrutura organizacional (nada é digitado). */
export async function jobFormOptions(user: CurrentUser) {
  const scope = unitScope(user);
  const [units, departments, positions, managers] = await Promise.all([
    prisma.unit.findMany({ where: { active: true, ...(scope ? { id: scope } : {}) }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.department.findMany({ where: { active: true, ...(scope ? { unitId: scope } : {}) }, orderBy: { name: "asc" }, select: { id: true, name: true, unitId: true } }),
    prisma.position.findMany({ where: { active: true }, orderBy: { title: "asc" }, select: { id: true, title: true, level: true, defaultDepartmentName: true } }),
    prisma.manager.findMany({
      where: { active: true, ...(scope ? { department: { unitId: scope } } : {}) },
      orderBy: { name: "asc" },
      select: { id: true, name: true, departmentId: true, department: { select: { unitId: true, name: true } }, position: { select: { title: true } } },
    }),
  ]);
  return {
    units,
    departments,
    positions,
    managers: managers.map((m) => ({ id: m.id, name: m.name, departmentId: m.departmentId, unitId: m.department.unitId, label: `${m.name} — ${m.position.title} (${m.department.name})` })),
  };
}
