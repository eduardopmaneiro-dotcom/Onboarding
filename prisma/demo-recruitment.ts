/**
 * Simulação do recrutamento (dados FICTÍCIOS) — 24 candidatos, 6 vagas, 3 unidades.
 * Usa os mesmos serviços das telas (sem atalhos no banco) para exercitar o fluxo
 * completo: cadastro → agendamento → resultado do RH → gestor (aprovar/reprovar/nova entrevista)
 * → avaliação externa → pretensão salarial. Usado pelo seed de demonstração e pelos testes.
 */
import type { PrismaClient } from "@prisma/client";
import type { CurrentUser } from "../src/lib/session";
import type { PermissionCode } from "../src/lib/permissions";
import { addDays, todayKey } from "../src/lib/datetime";
import { createJob } from "../src/modules/recruitment/jobs";
import { createCandidate } from "../src/modules/recruitment/candidates";
import { decideReview, registerResult, scheduleInterviews, setExternalCheck } from "../src/modules/recruitment/workflow";

export async function asUser(prisma: PrismaClient, email: string): Promise<CurrentUser> {
  const u = await prisma.user.findUniqueOrThrow({ where: { email }, include: { manager: true } });
  const grants = await prisma.rolePermission.findMany({ where: { role: u.role }, include: { permission: true } });
  return { id: u.id, name: u.name, email: u.email, role: u.role, unitId: u.unitId, managerId: u.manager?.id ?? null, mustChangePassword: false, permissions: new Set(grants.map((g) => g.permission.code as PermissionCode)) };
}

type Plan = { name: string; phone: string; job: number; day: number; time: string; result?: "APROVADO" | "REPROVADO" | "NAO_COMPARECEU" | "DESISTIU" | "PENDENTE"; reason?: string; note?: string; gestor?: "APROVADO" | "REPROVADO" | "NOVA_ENTREVISTA"; ext?: "AGUARDANDO" | "APROVADO" | "REPROVADO"; salary?: [number, number, number?] };

export async function simulateRecruitment(prisma: PrismaClient, opts: { tag?: string } = {}) {
  const tag = opts.tag ?? "";
  const rh = await asUser(prisma, "rh@rialehoteis.com.br");
  const marina = await asUser(prisma, "marina.souza@rialehoteis.com.br");
  const unit = async (code: string) => prisma.unit.findUniqueOrThrow({ where: { code } });
  const dept = async (code: string, d: string) => prisma.department.findFirstOrThrow({ where: { code: d, unit: { code } } });
  const pos = async (title: string) => prisma.position.findUniqueOrThrow({ where: { title } });
  const mgr = async (email: string) => prisma.manager.findUniqueOrThrow({ where: { email } });
  void unit;

  const today = todayKey();
  const jobsDef = [
    { p: "Recepcionista", u: "BRISA", d: "REC", m: "marina.souza@rialehoteis.com.br", n: 2, sal: "2150", sch: "DOZE_POR_TRINTA_E_SEIS", sh: "NOTURNO", h: 36 },
    { p: "Garçom", u: "IMPERIAL", d: "SAL", m: "fernanda.castro@rialehoteis.com.br", n: 3, sal: "1980", sch: "SEIS_POR_UM", sh: "MISTO", h: 44 },
    { p: "Camareira", u: "BRISA", d: "GOV", m: "lucia.ferreira@rialehoteis.com.br", n: 2, sal: "1850", sch: "SEIS_POR_UM", sh: "DIURNO", h: 44 },
    { p: "Auxiliar de Cozinha", u: "IMPERIAL", d: "COZ", m: "andre.moura@rialehoteis.com.br", n: 1, sal: "1750", sch: "SEIS_POR_UM", sh: "DIURNO", h: 44 },
    { p: "Recepcionista", u: "VILAMAR", d: "REC", m: "roberto.nogueira@rialehoteis.com.br", n: 1, sal: "2100", sch: "DOZE_POR_TRINTA_E_SEIS", sh: "DIURNO", h: 36 },
    { p: "Auxiliar de Manutenção", u: "BRISA", d: "MAN", m: "ricardo.albuquerque@rialehoteis.com.br", n: 1, sal: "2000", sch: "CINCO_POR_DOIS", sh: "DIURNO", h: 44 },
  ];
  const jobs = [];
  for (const j of jobsDef) {
    jobs.push(
      await createJob(rh, {
        positionId: (await pos(j.p)).id, departmentId: (await dept(j.u, j.d)).id, requestingManagerId: (await mgr(j.m)).id,
        headcount: j.n, openedAt: addDays(today, -21), expectedSalary: j.sal, schedule: j.sch, shift: j.sh, weeklyHours: j.h, status: "ABERTA",
      })
    );
  }

  const R = Object.fromEntries((await prisma.rejectionReason.findMany()).map((r) => [r.code, r.id]));
  const plans: Plan[] = [
    // Recepcionista Brisa (gestora Marina tem login → decide ela mesma)
    { name: "Ana Paula Ribeiro", phone: "21981110001", job: 0, day: -10, time: "09:00", result: "APROVADO", gestor: "APROVADO", ext: "APROVADO", salary: [2150, 2300, 2050] },
    { name: "Bruno Cardoso Lima", phone: "21981110002", job: 0, day: -10, time: "09:30", result: "APROVADO", gestor: "REPROVADO" },
    { name: "Carla Nunes Teixeira", phone: "21981110003", job: 0, day: -10, time: "10:00", result: "REPROVADO", reason: "EXPERIENCIA" },
    { name: "Diego Martins Souza", phone: "21981110004", job: 0, day: -7, time: "14:00", result: "APROVADO", gestor: "NOVA_ENTREVISTA" },
    { name: "Elisa Gomes Prado", phone: "21981110005", job: 0, day: -7, time: "14:30", result: "DESISTIU", reason: "PRETENSAO_SALARIAL", salary: [2150, 2800, 2600] },
    { name: "Fábio Rocha Andrade", phone: "21981110006", job: 0, day: 2, time: "09:00" },
    // Garçom Imperial (gestora Fernanda sem login → RH registra em nome dela)
    { name: "Gabriel Pires Moreira", phone: "21981110007", job: 1, day: -12, time: "10:00", result: "APROVADO", gestor: "APROVADO", ext: "AGUARDANDO" },
    { name: "Helena Duarte Campos", phone: "21981110008", job: 1, day: -12, time: "10:30", result: "REPROVADO", reason: "COMPORTAMENTAL" },
    { name: "Igor Batista Freitas", phone: "21981110009", job: 1, day: -12, time: "11:00", result: "NAO_COMPARECEU" },
    { name: "Juliana Costa Barros", phone: "21981110010", job: 1, day: -5, time: "15:00", result: "APROVADO", gestor: "APROVADO", salary: [1980, 2100] },
    { name: "Kleber Alves Santana", phone: "21981110011", job: 1, day: -5, time: "15:30", result: "REPROVADO", reason: "DISPONIBILIDADE_HORARIO" },
    { name: "Larissa Fonseca Melo", phone: "21981110012", job: 1, day: 1, time: "10:00" },
    // Camareira Brisa (gestora Lúcia sem login)
    { name: "Marcia Vieira Lopes", phone: "21981110013", job: 2, day: -9, time: "08:30", result: "APROVADO", gestor: "APROVADO", ext: "REPROVADO" },
    { name: "Natália Ramos Cunha", phone: "21981110014", job: 2, day: -9, time: "09:00", result: "REPROVADO", reason: "ESCALA" },
    { name: "Olívia Machado Reis", phone: "21981110015", job: 2, day: -3, time: "08:30", result: "APROVADO" },
    { name: "Patrícia Lemos Dias", phone: "21981110016", job: 2, day: -3, time: "09:00", result: "REPROVADO", reason: "OUTRO", note: "Mora em Santa Cruz; deslocamento de 2h30 por trecho" },
    // Auxiliar de Cozinha Imperial (gestor André sem login)
    { name: "Rafael Tavares Nogueira", phone: "21981110017", job: 3, day: -8, time: "13:00", result: "APROVADO", gestor: "REPROVADO" },
    { name: "Sabrina Azevedo Pinto", phone: "21981110018", job: 3, day: -8, time: "13:30", result: "REPROVADO", reason: "TECNICA" },
    { name: "Thiago Correia Matos", phone: "21981110019", job: 3, day: -1, time: "13:00", result: "PENDENTE" },
    // Recepcionista Vilamar
    { name: "Ursula Ferraz Leite", phone: "21981110020", job: 4, day: -6, time: "10:00", result: "REPROVADO", reason: "ESCOLARIDADE" },
    { name: "Vinícius Prado Arruda", phone: "21981110021", job: 4, day: -6, time: "10:30", result: "APROVADO", gestor: "APROVADO", salary: [2100, 2100, 1900] },
    { name: "Wesley Queiroz Moura", phone: "21981110022", job: 4, day: 3, time: "10:00" },
    // Auxiliar de Manutenção Brisa
    { name: "Yasmin Barreto Sales", phone: "21981110023", job: 5, day: -4, time: "16:00", result: "DESISTIU" },
    { name: "Zeca Antunes Ferreira", phone: "21981110024", job: 5, day: -2, time: "16:00" }, // passou e ficou sem resultado → fila do RH
  ];

  const created: string[] = [];
  for (const p of plans) {
    const name = tag ? `${p.name} ${tag}` : p.name;
    const phone = tag ? p.phone.slice(0, 7) + String(Math.floor(Math.random() * 9000) + 1000) : p.phone;
    const { candidate } = await createCandidate(rh, { fullName: name, phone, jobOpeningId: jobs[p.job].id, source: ["INDICACAO", "INDEED", "INSTAGRAM", "PRESENCIAL"][created.length % 4], confirmNew: true });
    created.push(candidate.id);
    const [iv] = await scheduleInterviews(rh, { jobOpeningId: jobs[p.job].id, candidateIds: [candidate.id], date: addDays(today, p.day), time: p.time, durationMin: 30 });
    if (!p.result) continue;
    await registerResult(rh, iv.id, {
      result: p.result, reasonId: p.reason ? R[p.reason] : undefined, note: p.note,
      offeredSalary: p.salary?.[0], expectedSalary: p.salary?.[1], lastSalary: p.salary?.[2],
      valuedBenefits: p.salary ? ["Vale-transporte", "Plano de saúde"] : undefined,
      externalCheck: p.ext === "AGUARDANDO" || p.ext === "APROVADO" || p.ext === "REPROVADO",
    });
    if (p.gestor) {
      const review = await prisma.managerReview.findFirstOrThrow({ where: { application: { candidateId: candidate.id }, status: "PENDENTE" } });
      const decider = p.job === 0 ? marina : rh; // Marina decide; demais gestores sem login → RH em nome deles
      await decideReview(decider, review.id, {
        decision: p.gestor,
        justification: p.gestor === "REPROVADO" ? "Perfil não atende ao ritmo da operação noturna" : p.job === 0 ? (p.gestor === "NOVA_ENTREVISTA" ? "Quero conversar sobre disponibilidade aos domingos" : undefined) : "Gestor decidiu em reunião presencial com o RH",
      });
    }
    if (p.ext && p.ext !== "AGUARDANDO") {
      const app = await prisma.application.findFirstOrThrow({ where: { candidateId: candidate.id } });
      await setExternalCheck(rh, app.id, p.ext, p.ext === "REPROVADO" ? "Pendência na pesquisa de antecedentes" : "Liberado pela AGINCO");
    }
  }
  return { jobs: jobs.map((j) => j.id), candidates: created };
}
