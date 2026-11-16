/**
 * Simulação da admissão e do ciclo inicial (dados FICTÍCIOS — apenas dev/testes).
 * Usa os mesmos serviços das telas: encaminhamento, checklist, exame, confirmação,
 * marcos da experiência, cadastro direto de quem já trabalhava e desligamentos.
 */
import type { PrismaClient } from "@prisma/client";
import { addDays, todayKey } from "../src/lib/datetime";
import { asUser } from "./demo-recruitment";
import { cancelAdmission, confirmAdmission, forwardToAdmission, scheduleExam, setDocumentStatus, updateAdmission, updateExam } from "../src/modules/admission/service";
import { saveClinic } from "../src/modules/admission/config";
import { createDirectEmployee, recordMilestone, terminateEmployee } from "../src/modules/people/service";

/** CPF fictício com dígitos verificadores válidos. */
export function fakeCpf(seed: number): string {
  const d = String(100000000 + ((seed * 7919) % 899999999)).slice(0, 9).split("").map(Number);
  for (const len of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += d[i] * (len + 1 - i);
    const r = (sum * 10) % 11;
    d.push(r === 10 ? 0 : r);
  }
  return d.join("");
}

export async function approveAllDocs(prisma: PrismaClient, rhEmail: string, admissionId: string, except: string[] = []) {
  const rh = await asUser(prisma, rhEmail);
  const docs = await prisma.admissionDocument.findMany({ where: { admissionId }, include: { docType: true } });
  for (const d of docs) if (!except.includes(d.docType.code)) await setDocumentStatus(rh, d.id, { status: "APROVADO" });
}

export async function simulateAdmissions(prisma: PrismaClient, opts: { cpfSeed?: number } = {}) {
  const rh = await asUser(prisma, "rh@rialehoteis.com.br");
  const today = todayKey();
  const seed = opts.cpfSeed ?? 500;
  const clinic = (await prisma.clinic.findFirst({ where: { name: "Clínica Ocupacional Demonstração" } })) ?? (await saveClinic(rh, { name: "Clínica Ocupacional Demonstração", address: "Endereço fictício", phone: "(21) 3000-0000" }));

  // 1) Candidatos aprovados no recrutamento simulado
  const ready = await prisma.application.findMany({ where: { status: "APROVADO", admissions: { none: {} } }, orderBy: { approvedAt: "asc" }, take: 3 });
  const results: string[] = [];
  for (const [i, app] of ready.entries()) {
    const adm = await forwardToAdmission(rh, app.id);
    await updateAdmission(rh, adm.id, { admissionDate: today, cpf: fakeCpf(seed + i), hasDependents: i === 0 ? "true" : "false" });
    if (i === 0) {
      // fluxo completo → colaborador
      await approveAllDocs(prisma, rh.email, adm.id);
      const ex = await scheduleExam(rh, adm.id, { clinicId: clinic.id, date: today, time: "08:00" });
      await updateExam(rh, ex.id, { action: "realizado", date: today });
      await updateExam(rh, ex.id, { action: "aso", date: today, result: "APTO" });
      await confirmAdmission(rh, adm.id);
      results.push("convertido");
    } else if (i === 1) {
      // documentação pendente e exame agendado
      const docs = await prisma.admissionDocument.findMany({ where: { admissionId: adm.id }, include: { docType: true }, orderBy: { docType: { sortOrder: "asc" } } });
      await setDocumentStatus(rh, docs[0].id, { status: "APROVADO" });
      await setDocumentStatus(rh, docs[1].id, { status: "EM_ANALISE" });
      await setDocumentStatus(rh, docs[2].id, { status: "RECUSADO", refusalReason: "Foto ilegível — enviar nova" });
      await scheduleExam(rh, adm.id, { clinicId: clinic.id, date: addDays(today, 2), time: "09:30" });
      results.push("documentos pendentes");
    } else {
      // faltou ao exame e desistiu
      const ex = await scheduleExam(rh, adm.id, { clinicId: clinic.id, date: today, time: "07:30" });
      await updateExam(rh, ex.id, { action: "falta" });
      await cancelAdmission(rh, adm.id, { reason: "DESISTENCIA_CANDIDATO", note: "Aceitou outra proposta" });
      results.push("desistência");
    }
  }

  // 2) Quem já trabalhava antes da plataforma (base para tempo de casa e turnover)
  const pos = async (t: string) => (await prisma.position.findUniqueOrThrow({ where: { title: t } })).id;
  const dept = async (u: string, d: string) => (await prisma.department.findFirstOrThrow({ where: { code: d, unit: { code: u } } })).id;
  const staff: Array<[string, string, string, string, number, string?, number?, string?]> = [
    // nome, cargo, unidade, depto, admissão (dias atrás), tipo de desligamento, desligado há (dias), contrato
    ["Mariana Teles Fonseca", "Recepcionista", "BRISA", "REC", 900],
    ["Otávio Brandão Reis", "Recepcionista", "BRISA", "REC", 420, "PEDIDO_DEMISSAO", 30],
    ["Patrícia Leal Moreira", "Camareira", "BRISA", "GOV", 1500],
    ["Rafaela Duarte Pinho", "Camareira", "BRISA", "GOV", 70, "RESCISAO_ANTECIPADA_COLABORADOR", 40],
    ["Sílvia Antunes Barros", "Camareira", "BRISA", "GOV", 200],
    ["Tiago Mendes Coelho", "Garçom", "IMPERIAL", "SAL", 600],
    ["Ulisses Prado Viana", "Garçom", "IMPERIAL", "SAL", 120, "TERMINO_EXPERIENCIA", 31],
    ["Vanessa Rios Campos", "Garçom", "IMPERIAL", "SAL", 25],
    ["Wagner Lopes Freitas", "Auxiliar de Cozinha", "IMPERIAL", "COZ", 300, "DISPENSA_SEM_JUSTA_CAUSA", 10],
    ["Yara Fontes Quintela", "Auxiliar de Cozinha", "IMPERIAL", "COZ", 2000],
    ["Zeca Moura Albuquerque", "Recepcionista", "VILAMAR", "REC", 40],
    ["Bianca Neves Arruda", "Recepcionista", "VILAMAR", "REC", 800],
    ["Caio Siqueira Dantas", "Auxiliar de Manutenção", "BRISA", "MAN", 1100],
  ];
  let n = 0;
  for (const [name, p, u, d, ago, type, offAgo] of staff) {
    const e = await createDirectEmployee(rh, { fullName: name, cpf: fakeCpf(seed + 100 + n++), admissionDate: addDays(today, -ago), positionId: await pos(p), departmentId: await dept(u, d), contractType: "CLT", schedule: "SEIS_POR_UM" });
    if (type) await terminateEmployee(rh, e.id, { date: addDays(today, -(offAgo ?? 0)), type, reason: "Registro de demonstração" });
  }
  // marco de 30 dias avaliado para quem está na experiência
  const m = await prisma.probationMilestone.findFirst({ where: { status: "PENDENTE", days: 30, employee: { fullName: "Zeca Moura Albuquerque" } } });
  if (m) await recordMilestone(rh, m.id, { outcome: "SEGUE", notes: "Boa adaptação à equipe" });
  return { admissions: results, staff: staff.length };
}
