import { z } from "zod";
import type { Prisma, TerminationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { assertCan, can, type CurrentUser } from "@/lib/session";
import { addDays, dateKey, fmtDate, localToDate, todayKey } from "@/lib/datetime";
import { cpfHash, protectCpf } from "@/lib/cpf";
import { tidyName, normalizePhone, parseMoney } from "@/lib/text";
import { cpf as cpfSchema } from "@/modules/shared/validation";
import { NotFoundError, ValidationError } from "@/modules/shared/errors";
import { recordEvent } from "@/modules/recruitment/events";
import { employeeScopeWhere } from "@/modules/people/scope";
import { currentRule } from "@/modules/people/rule-settings";
import { milestoneDate, probationEnd, type ProbationRule } from "@/modules/people/rules";
import { TERMINATION_LABEL } from "@/modules/admission/constants";

type Tx = Prisma.TransactionClient;
const dateStr = z.string({ error: "Data obrigatória" }).regex(/^\d{4}-\d{2}-\d{2}$/, "Use AAAA-MM-DD").refine((v) => !Number.isNaN(Date.parse(`${v}T12:00:00Z`)) && new Date(`${v}T12:00:00Z`).toISOString().startsWith(v), "Data inexistente");

/** Próxima matrícula livre (sequência do banco; pula números já usados por matrículas antigas). */
export async function nextRegistration(tx: Tx): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const [{ n }] = await tx.$queryRaw<Array<{ n: bigint }>>`SELECT nextval('employee_registration_seq') AS n`;
    const code = String(n).padStart(6, "0");
    if (!(await tx.employee.findUnique({ where: { internalId: code }, select: { id: true } }))) return code;
  }
  throw new Error("Não foi possível gerar a matrícula");
}

/** Experiência só para contrato CLT (contrato de experiência — CLT art. 443 e 445). */
export function hasProbation(contractType: string) {
  return contractType === "CLT";
}

/**
 * Cria o colaborador com os marcos da experiência e a movimentação de admissão.
 * `onlyFutureMilestones`: no cadastro de quem já trabalhava, marcos já passados não são criados (não geram alerta retroativo).
 */
export async function createEmployeeTx(
  tx: Tx,
  actor: CurrentUser,
  data: Omit<Prisma.EmployeeUncheckedCreateInput, "internalId" | "admissionDate" | "probationEndDate" | "status"> & { internalId?: string | null; admission: string },
  rule: ProbationRule,
  opts: { onlyFutureMilestones?: boolean } = {}
) {
  const { admission, internalId, ...rest } = data;
  const probation = hasProbation(String(rest.contractType ?? "CLT"));
  const end = probation ? probationEnd(admission, rule) : null;
  const emp = await tx.employee.create({
    data: {
      ...rest,
      internalId: internalId || (await nextRegistration(tx)),
      status: "ATIVO",
      admissionDate: localToDate(admission),
      probationEndDate: end ? localToDate(end) : null,
      createdById: actor.id,
    },
  });
  if (probation) {
    const today = todayKey();
    const max = Math.max(...rule.milestones);
    const items = rule.milestones
      .map((days) => ({ days, due: milestoneDate(admission, days, rule.countAdmissionDay) }))
      .filter((m) => !opts.onlyFutureMilestones || m.due >= today);
    if (items.length) await tx.probationMilestone.createMany({ data: items.map((m) => ({ employeeId: emp.id, days: m.days, dueDate: localToDate(m.due), isFinal: m.days === max })) });
  }
  await tx.movementHistory.create({
    data: { employeeId: emp.id, type: "ADMISSAO", effectiveDate: localToDate(admission), toPositionId: emp.positionId, toDepartmentId: emp.departmentId, toManagerId: emp.managerId, recordedById: actor.id, reason: rest.origin === "RECRUTAMENTO" ? "Admissão pelo processo seletivo" : "Cadastro de colaborador já admitido" },
  });
  return emp;
}

const directInput = z.object({
  fullName: z.string({ error: "Nome obrigatório" }).trim().min(3, "Nome completo").max(120).transform(tidyName),
  cpf: cpfSchema,
  internalId: z.string().trim().max(20).optional(),
  email: z.email("E-mail inválido").optional(),
  phone: z.string().optional(),
  admissionDate: dateStr,
  positionId: z.string({ error: "Cargo obrigatório" }).min(1, "Cargo obrigatório"),
  departmentId: z.string({ error: "Departamento obrigatório" }).min(1, "Departamento obrigatório"),
  managerId: z.string().optional(),
  contractType: z.enum(["CLT", "PJ", "ESTAGIO", "TEMPORARIO", "APRENDIZ"]).default("CLT"),
  salary: z.string().optional(),
  schedule: z.enum(["SEIS_POR_UM", "CINCO_POR_DOIS", "DOZE_POR_TRINTA_E_SEIS", "OUTRA"]).optional(),
  shift: z.enum(["DIURNO", "NOTURNO", "MISTO", "ADMINISTRATIVO"]).optional(),
});

async function assertStructure(departmentId: string, positionId: string, managerId?: string | null) {
  const [dept, pos, mgr] = await Promise.all([
    prisma.department.findFirst({ where: { id: departmentId, active: true } }),
    prisma.position.findFirst({ where: { id: positionId, active: true } }),
    managerId ? prisma.manager.findFirst({ where: { id: managerId, active: true } }) : Promise.resolve(null),
  ]);
  if (!dept) throw new ValidationError("Departamento inválido", { departmentId: ["Departamento inexistente ou inativo"] });
  if (!pos) throw new ValidationError("Cargo inválido", { positionId: ["Cargo inexistente ou inativo"] });
  if (managerId && !mgr) throw new ValidationError("Gestor inválido", { managerId: ["Gestor inexistente ou inativo"] });
  return dept;
}

async function assertCpfFree(hash: string) {
  const active = await prisma.employee.findFirst({ where: { cpfHash: hash, status: { not: "DESLIGADO" } }, select: { fullName: true, internalId: true } });
  if (active) throw new ValidationError(`CPF já pertence a um colaborador ativo (${active.fullName}, matrícula ${active.internalId})`, { cpf: ["CPF de colaborador ativo"] });
}

/** Cadastro de quem já trabalhava antes da plataforma (completa a base do turnover). */
export async function createDirectEmployee(actor: CurrentUser, raw: unknown) {
  assertCan(actor, "colaboradores.manage");
  const d = directInput.parse(raw);
  if (d.admissionDate > todayKey()) throw new ValidationError("Para admissões futuras use o processo de admissão", { admissionDate: ["Data futura"] });
  const dept = await assertStructure(d.departmentId, d.positionId, d.managerId);
  if (actor.role === "RH" && actor.unitId && dept.unitId !== actor.unitId) throw new ValidationError("Departamento fora da sua unidade", { departmentId: ["Fora da sua unidade"] });
  await assertCpfFree(cpfHash(d.cpf));
  if (d.internalId && (await prisma.employee.findUnique({ where: { internalId: d.internalId } }))) throw new ValidationError("Matrícula já usada", { internalId: ["Matrícula já cadastrada"] });
  const salary = d.salary ? parseMoney(d.salary) : null;
  if (d.salary && (!salary || salary <= 0)) throw new ValidationError("Salário inválido", { salary: ["Valor inválido"] });
  const rule = await currentRule();
  const emp = await prisma.$transaction((tx) => createEmployeeTx(tx, actor, {
    fullName: d.fullName, ...protectCpf(d.cpf), email: d.email ?? null, phone: normalizePhone(d.phone), contractType: d.contractType, origin: "CADASTRO_DIRETO",
    departmentId: d.departmentId, positionId: d.positionId, managerId: d.managerId ?? null, baseSalary: salary, schedule: d.schedule ?? null, shift: d.shift ?? null,
    internalId: d.internalId ?? null, admission: d.admissionDate,
  }, rule, { onlyFutureMilestones: true }));
  await recordAudit({ entityType: "Employee", entityId: emp.id, action: "CREATE", actorId: actor.id, actorRole: actor.role, newValue: { origin: "CADASTRO_DIRETO", admissionDate: d.admissionDate, positionId: d.positionId, departmentId: d.departmentId } });
  return emp;
}

export async function listEmployees(user: CurrentUser, f: { q?: string; unidade?: string; departamento?: string; status?: string; experiencia?: string } = {}) {
  assertCan(user, "colaboradores.view");
  const where: Prisma.EmployeeWhereInput = { AND: [employeeScopeWhere(user)] };
  const and = where.AND as Prisma.EmployeeWhereInput[];
  if (f.q) and.push({ OR: [{ fullName: { contains: f.q, mode: "insensitive" } }, { internalId: { contains: f.q } }] });
  if (f.unidade) and.push({ department: { unitId: f.unidade } });
  if (f.departamento) and.push({ departmentId: f.departamento });
  if (f.status === "ATIVO") and.push({ status: { not: "DESLIGADO" } });
  else if (f.status === "DESLIGADO") and.push({ status: "DESLIGADO" });
  if (f.experiencia) and.push({ status: { not: "DESLIGADO" }, probationEndDate: { gte: localToDate(todayKey()) } });
  return prisma.employee.findMany({
    where,
    orderBy: [{ status: "asc" }, { fullName: "asc" }],
    include: {
      position: { select: { title: true } }, department: { include: { unit: { select: { id: true, name: true } } } }, manager: { select: { name: true } },
      milestones: { where: { status: "PENDENTE" }, orderBy: { dueDate: "asc" }, take: 1 },
    },
  });
}

export async function getEmployee(user: CurrentUser, id: string) {
  assertCan(user, "colaboradores.view");
  const e = await prisma.employee.findFirst({
    where: { id, ...employeeScopeWhere(user) },
    include: {
      position: true, department: { include: { unit: true } }, manager: { select: { id: true, name: true } },
      milestones: { orderBy: { days: "asc" } },
      movements: { orderBy: { effectiveDate: "asc" }, include: { toPosition: { select: { title: true } }, toDepartment: { select: { name: true } }, recordedBy: { select: { name: true } } } },
      admission: { include: { documents: { include: { docType: true } }, exams: { include: { clinic: true }, orderBy: { scheduledAt: "asc" } } } },
      candidate: {
        include: {
          applications: {
            include: {
              jobOpening: { include: { position: { select: { title: true } }, department: { include: { unit: { select: { name: true } } } } } },
              interviews: { orderBy: { scheduledAt: "asc" }, include: { reason: { select: { label: true } }, interviewerUser: { select: { name: true } } } },
              managerReviews: { orderBy: { requestedAt: "asc" }, include: { manager: { select: { name: true } } } },
            },
          },
          events: { orderBy: { occurredAt: "asc" }, include: { actorUser: { select: { name: true } } } },
        },
      },
    },
  });
  if (!e) throw new NotFoundError("Colaborador não encontrado");
  const showSalary = can(user, "colaboradores.salario");
  return { ...e, baseSalary: showSalary ? e.baseSalary : null, showSalary };
}

const milestoneInput = z.object({ outcome: z.enum(["SEGUE", "EFETIVADO", "DESLIGAMENTO"], { error: "Escolha o resultado" }), notes: z.string().trim().max(2000).optional() });

/** Registro da avaliação do marco pelo RH. */
export async function recordMilestone(actor: CurrentUser, milestoneId: string, raw: unknown) {
  assertCan(actor, "colaboradores.manage");
  const d = milestoneInput.parse(raw);
  const m = await prisma.probationMilestone.findFirst({ where: { id: milestoneId, employee: employeeScopeWhere(actor) }, include: { employee: true } });
  if (!m) throw new NotFoundError("Marco não encontrado");
  if (m.status !== "PENDENTE") throw new ValidationError("Este marco já foi registrado");
  if (m.employee.status === "DESLIGADO") throw new ValidationError("Colaborador desligado");
  if (m.isFinal && d.outcome === "SEGUE") throw new ValidationError("No último marco o resultado é efetivação ou desligamento", { outcome: ["Escolha efetivado ou desligamento"] });
  if (!m.isFinal && d.outcome === "EFETIVADO") throw new ValidationError("A efetivação é registrada no último marco da experiência", { outcome: ["Use “segue na experiência”"] });
  if (d.outcome === "DESLIGAMENTO" && !d.notes) throw new ValidationError("Descreva o motivo da indicação de desligamento", { notes: ["Obrigatório para desligamento"] });
  await prisma.probationMilestone.update({ where: { id: m.id }, data: { status: "REALIZADO", outcome: d.outcome, notes: d.notes ?? null, doneAt: new Date(), doneById: actor.id } });
  await recordAudit({ entityType: "ProbationMilestone", entityId: m.id, action: "UPDATE", actorId: actor.id, actorRole: actor.role, newValue: { days: m.days, outcome: d.outcome } });
}

const terminationInput = z.object({
  date: dateStr,
  type: z.enum(Object.keys(TERMINATION_LABEL) as [TerminationType, ...TerminationType[]], { error: "Escolha o tipo de desligamento" }),
  reason: z.string({ error: "Descreva o motivo" }).trim().min(3, "Descreva o motivo").max(2000),
});

export async function terminateEmployee(actor: CurrentUser, employeeId: string, raw: unknown) {
  assertCan(actor, "colaboradores.manage");
  const d = terminationInput.parse(raw);
  const e = await prisma.employee.findFirst({ where: { id: employeeId, ...employeeScopeWhere(actor) } });
  if (!e) throw new NotFoundError("Colaborador não encontrado");
  if (e.status === "DESLIGADO") throw new ValidationError("Colaborador já desligado");
  const adm = dateKey(e.admissionDate);
  if (d.date < adm) throw new ValidationError("O desligamento não pode ser anterior à admissão", { date: ["Antes da admissão"] });
  if (d.date > addDays(todayKey(), 30)) throw new ValidationError("Registre o desligamento até 30 dias antes da data", { date: ["Data muito distante"] });
  const inProbation = !!e.probationEndDate && d.date <= dateKey(e.probationEndDate);
  if (["TERMINO_EXPERIENCIA", "RESCISAO_ANTECIPADA_EMPRESA", "RESCISAO_ANTECIPADA_COLABORADOR"].includes(d.type) && !inProbation)
    throw new ValidationError(`Fora do período de experiência${e.probationEndDate ? ` (terminou em ${fmtDate(e.probationEndDate)})` : ""}`, { type: ["Tipo válido só na experiência"] });
  await prisma.$transaction(async (tx) => {
    await tx.employee.update({ where: { id: e.id }, data: { status: "DESLIGADO", terminationDate: localToDate(d.date), terminationType: d.type, terminationReason: d.reason, terminationById: actor.id } });
    await tx.probationMilestone.updateMany({ where: { employeeId: e.id, status: "PENDENTE" }, data: { status: "ENCERRADO_DESLIGAMENTO" } });
    await tx.movementHistory.create({ data: { employeeId: e.id, type: "DESLIGAMENTO", effectiveDate: localToDate(d.date), fromPositionId: e.positionId, fromDepartmentId: e.departmentId, fromManagerId: e.managerId, reason: `${TERMINATION_LABEL[d.type]} — ${d.reason}`, recordedById: actor.id } });
    if (e.candidateId) await recordEvent(tx, { candidateId: e.candidateId, applicationId: e.applicationId, type: "STATUS", summary: `Colaborador desligado em ${fmtDate(localToDate(d.date))} (${TERMINATION_LABEL[d.type]}${inProbation ? ", durante a experiência" : ""})`, actorUserId: actor.id });
  });
  await recordAudit({ entityType: "Employee", entityId: e.id, action: "STATUS_CHANGE", actorId: actor.id, actorRole: actor.role, previousValue: { status: e.status }, newValue: { status: "DESLIGADO", date: d.date, type: d.type, inProbation } });
}

/** Agenda da experiência: marcos pendentes de colaboradores ativos, com prazo e atraso. */
export async function milestoneAgenda(user: CurrentUser, horizonDays = 30) {
  assertCan(user, "colaboradores.view");
  const rule = await currentRule();
  const today = todayKey();
  const rows = await prisma.probationMilestone.findMany({
    where: { status: "PENDENTE", employee: { status: { not: "DESLIGADO" }, ...employeeScopeWhere(user) }, dueDate: { lte: localToDate(addDays(today, horizonDays)) } },
    orderBy: { dueDate: "asc" },
    include: { employee: { select: { id: true, fullName: true, admissionDate: true, position: { select: { title: true } }, department: { select: { name: true, unit: { select: { name: true } } } }, manager: { select: { name: true } } } } },
  });
  return rows.map((m) => {
    const due = dateKey(m.dueDate);
    return { ...m, due, overdue: due < today, dueSoon: due >= today && due <= addDays(today, rule.leadDays) };
  });
}

export async function countMilestonesNeedingAction(user: CurrentUser) {
  if (!user.permissions.has("colaboradores.view")) return 0;
  const rule = await currentRule();
  return prisma.probationMilestone.count({ where: { status: "PENDENTE", employee: { status: { not: "DESLIGADO" }, ...employeeScopeWhere(user) }, dueDate: { lte: localToDate(addDays(todayKey(), rule.leadDays)) } } });
}
