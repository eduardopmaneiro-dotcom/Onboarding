import type { Prisma } from "@prisma/client";
import type { CurrentUser } from "@/lib/session";

/**
 * Escopo do recrutamento:
 * - ADMIN e RH corporativo: tudo; RH de unidade: vagas da unidade;
 * - GESTOR: vagas em que é o gestor responsável ou de departamentos que ele gere.
 */
export function jobScopeWhere(user: CurrentUser): Prisma.JobOpeningWhereInput {
  if (user.role === "ADMIN") return {};
  if (user.role === "RH") return user.unitId ? { department: { unitId: user.unitId } } : {};
  if (!user.managerId) return { id: "__none__" };
  return { OR: [{ requestingManagerId: user.managerId }, { department: { managers: { some: { id: user.managerId, active: true } } } }] };
}

export function candidateScopeWhere(user: CurrentUser): Prisma.CandidateWhereInput {
  if (user.role === "ADMIN") return {};
  if (user.role === "RH" && !user.unitId) return {};
  const jobs = jobScopeWhere(user);
  // RH de unidade também vê candidatos ainda sem vaga (banco de talentos comum)
  if (user.role === "RH") return { OR: [{ applications: { some: { jobOpening: jobs } } }, { applications: { none: {} } }] };
  return { applications: { some: { jobOpening: jobs } } };
}

export function interviewScopeWhere(user: CurrentUser): Prisma.InterviewWhereInput {
  return { application: { jobOpening: jobScopeWhere(user) } };
}
