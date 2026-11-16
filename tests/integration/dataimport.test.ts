/**
 * Carga de dados da empresa com planilha SINTÉTICA (dados fictícios): cargos/descritivos/pisos,
 * colaboradores (CLT, aprendiz, afastado, desligado, inválido), rubricas, benefícios, encargos, clínica.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { prisma } from "../../src/lib/prisma";
import { asUser } from "../../prisma/demo-recruitment";
import { fakeCpf } from "../../prisma/demo-admission";
import { cpfHash } from "../../src/lib/cpf";
import { applyCompanyData, uploadCompanyData } from "../../src/modules/dataimport/service";
import { readDocument } from "../../src/modules/documents/service";
import { competenceReport } from "../../src/modules/compensation/service";
import { departmentFor, rubricType, splitActivities, splitTitle } from "../../src/modules/dataimport/rules";
import { toPublicError } from "../../src/modules/shared/errors";

const TAG = Date.now().toString(36).toUpperCase().slice(-5);
const SEED = Number(Date.now().toString().slice(-7));
const status = (e: unknown) => toPublicError(e).status;
const CPF = { a: fakeCpf(SEED + 1), b: fakeCpf(SEED + 2), c: fakeCpf(SEED + 3), d: fakeCpf(SEED + 4) };
let saved: Array<{ id: string; ratePct: unknown; apprenticeRatePct: unknown; legalRef: string | null }> = [];

async function workbook() {
  const wb = new ExcelJS.Workbook();
  const add = (name: string, rows: unknown[][]) => { const ws = wb.addWorksheet(name); rows.forEach((r) => ws.addRow(r)); };
  add("Parâmetros", [["Competência", "Data do relatório de cargos", "Fonte cargos", "Fonte folha"], ["2026-09", "2026-09-30", `Relatório Teste ${TAG}`, `Folha Teste ${TAG}`]]);
  add("Cargos", [["Cargo", "Perfil", "Colaboradores", "Descrição", "Atividades", "Piso salarial", "CBO"],
    [`Atendente Zeta ${TAG}`, "CE", 3, "Atender hóspedes com cortesia.", "· Recepcionar hóspedes;\n· Registrar pedidos\n• Organizar o balcão", 2100, "999001 - Atendente"],
    [`Atendente Zeta ${TAG} Brisa`, "CE", 5, "Atender hóspedes com cortesia (Brisa).", "· Recepcionar hóspedes", 2300, "999001 - Atendente"],
    [`Chefe Zeta ${TAG} Brisa PJ`, "PAE", 0, "Coordenar a equipe.", "Planejar\nCoordenar", 9000, "999002 - Chefe"],
  ]);
  add("Colaboradores", [["Unidade", "Matrícula", "Nome", "CPF", "Admissão", "Situação", "Vínculo", "Horas mês", "Cargo", "CBO", "Centro de custo", "Departamento folha", "Salário", "Desligamento", "Origem da data de desligamento"],
    ["BRISA", `${TAG}1`, "PESSOA TESTE UM", CPF.a, "10/01/2024", "Trabalhando", "Celetista", "220,00", `ATENDENTE ZETA ${TAG}`, "999001", "RESTAURANTE", "SETOR - A&B", 2300, "", ""],
    ["BRISA", `${TAG}2`, "PESSOA TESTE DOIS", CPF.b, "05/05/2025", "Trabalhando", "Aprendiz", "120,00", `APRENDIZ ZETA ${TAG}`, "999003", "RH/DP", "ADM", 900, "", ""],
    ["IMPERIAL", `${TAG}3`, "PESSOA TESTE TRES", CPF.c, "01/02/2025", "Demitido", "Celetista", "220,00", `ATENDENTE ZETA ${TAG}`, "999001", "PORTARIA", "ADM", 2100, "12/09/2026", "saldo de salário de 12 dia(s)"],
    ["IMPERIAL", `${TAG}4`, "PESSOA TESTE QUATRO", CPF.d, "01/03/2025", "Doença", "Celetista", "220,00", `ATENDENTE ZETA ${TAG}`, "999001", "SALA NOVA", "ADM", 2100, "", ""],
    ["IMPERIAL", `${TAG}5`, "CPF INVALIDO", "111.111.111-11", "01/03/2025", "Trabalhando", "Celetista", "220,00", "X", "1", "RECEPÇÃO", "ADM", 2000, "", ""],
    ["VILAMAR", `${TAG}6`, "SOCIO", fakeCpf(SEED + 9), "01/01/2010", "Trabalhando", "Diretor", "", "SOCIO", "1", "GERENCIA", "ADM", 1621, "", ""],
  ]);
  add("Rubricas", [["Unidade", "Matrícula", "Código", "Rubrica", "Referência", "Valor", "Tipo"],
    ["BRISA", `${TAG}1`, "8781", "DIAS NORMAIS", "30,00", 2300, "P"],
    ["BRISA", `${TAG}1`, "203", "GORJETA", "0", 640.5, "P"],
    ["BRISA", `${TAG}1`, "238", "ELOGIO PREMIADO", "200,00", 200, "P"],
    ["BRISA", `${TAG}1`, "999", "ADICIONAL NOTURNO (INFOR)", "10:00", 120, "P"],
    ["BRISA", `${TAG}1`, "931", "1/3 DAS FERIAS", "0", 700, "P"],
    ["BRISA", `${TAG}1`, "205", "VALE TRANSPORTE - 6%", "6,00", 138, "D"],
    ["BRISA", `${TAG}1`, "8111", "ASSIST MEDICA INTERMEDICA", "0", 95.4, "D"],
    ["BRISA", `${TAG}1`, "204", "FARMACIA", "0", 30, "D"],
    ["BRISA", `${TAG}2`, "8781", "DIAS NORMAIS", "30,00", 900, "P"],
    ["IMPERIAL", `${TAG}3`, "9180", "SALDO DE SALARIO DIAS", "12,00", 840, "P"],
  ]);
  add("Encargos", [["Unidade", "Base INSS", "INSS empresa", "RAT", "Terceiros", "Base FGTS", "Valor FGTS", "Base FGTS aprendiz", "Valor FGTS aprendiz"],
    ["BRISA", 100000, 20000, 2067, 5800, 90000, 7200, 1000, 20], ["IMPERIAL", 50000, 10000, 500, 2900, 50000, 4000, 0, 0]]);
  add("Clínica", [["Nome", "Endereço", "Telefone", "CNPJ", "Observação"], [`Clínica Teste ${TAG}`, "Rua Fictícia, 1", "", "", ""]]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

before(async () => { saved = (await prisma.chargeRate.findMany()).map((r) => ({ id: r.id, ratePct: r.ratePct, apprenticeRatePct: r.apprenticeRatePct, legalRef: r.legalRef })); });
after(async () => {
  for (const r of saved) await prisma.chargeRate.update({ where: { id: r.id }, data: { ratePct: r.ratePct as never, apprenticeRatePct: r.apprenticeRatePct as never, legalRef: r.legalRef } });
  await prisma.chargeRateUnit.deleteMany({});
  await prisma.$disconnect();
});

test("Regras puras: título com unidade/PJ, atividades, centro de custo e rubricas", () => {
  assert.deepEqual(splitTitle("Gerente Geral Brisa PJ"), { base: "gerente geral", unit: "BRISA", pj: true, display: "Gerente Geral" });
  assert.equal(splitTitle("3º Cozinheiro(a)").base, "3 cozinheiro");
  assert.deepEqual(splitActivities("· Zelar pelo hóspede;\n· Limpar UHs\n• Repor enxoval."), ["Zelar pelo hóspede", "Limpar UHs", "Repor enxoval"]);
  assert.equal(departmentFor("BAR DO LOBBY"), "A&B — Salão");
  assert.equal(departmentFor("RH/DP"), "Recursos Humanos");
  assert.equal(departmentFor("SALA NOVA"), "Sala Nova");
  assert.equal(rubricType("GORJETA"), "TAXA_SERVICO");
  assert.equal(rubricType("1/3 DAS FERIAS"), "IGNORAR");
});

test("Prévia: nada gravado; problemas apontados por linha; só administrador", async () => {
  const rh = await asUser(prisma, "rh@rialehoteis.com.br");
  const admin = await asUser(prisma, "admin@rialehoteis.com.br");
  const buf = await workbook();
  await assert.rejects(uploadCompanyData(rh, new File([buf], "carga.xlsx")), (e) => status(e) === 403);
  const up = await uploadCompanyData(admin, new File([buf], "carga.xlsx"));
  const p = up.preview;
  assert.equal(p.people.total, 6);
  assert.equal(p.people.ok, 4);
  assert.deepEqual(p.people.problems.map((x) => x.line), [6, 7]); // CPF inválido; diretor (não é empregado)
  assert.ok(p.people.positionsFromPayroll.some((t) => t.toLowerCase() === `aprendiz zeta ${TAG}`.toLowerCase()));
  assert.equal(await prisma.employee.count({ where: { internalId: { startsWith: `BRISA-${TAG}` } } }), 0, "nada gravado na prévia");
  const doc = await prisma.document.findUniqueOrThrow({ where: { id: up.documentId } });
  assert.equal(doc.classification, "SENSIVEL");
  await assert.rejects(readDocument(rh, up.documentId), (e) => status(e) === 403); // arquivo com dados pessoais: só quem importa
});

test("Aplicação: cargos, descritivos, pisos por unidade, quadro, folha, benefícios, encargos e clínica; reimportação idempotente", async () => {
  const admin = await asUser(prisma, "admin@rialehoteis.com.br");
  const buf = await workbook();
  const r = await applyCompanyData(admin, (await uploadCompanyData(admin, new File([buf], "carga.xlsx"))).documentId);
  assert.equal(r.stats.employeesCreated, 4);
  assert.equal(r.stats.terminated, 1);
  // cargos e descritivo (variação com mais colaboradores: a da Brisa)
  const pos = await prisma.position.findFirstOrThrow({ where: { title: { equals: `Atendente Zeta ${TAG}`, mode: "insensitive" } }, include: { descriptions: true, salaryTable: true } });
  assert.equal(pos.levelConfirmed, false);
  assert.equal(pos.cbo, "999001");
  assert.ok(pos.aliases.includes(`Atendente Zeta ${TAG} Brisa`));
  const d = pos.descriptions.find((x) => x.status === "VIGENTE")!;
  assert.equal(d.objective, "Atender hóspedes com cortesia (Brisa).");
  assert.equal(d.behavioralProfile, "CE");
  const brisa = await prisma.unit.findUniqueOrThrow({ where: { code: "BRISA" } });
  assert.deepEqual(pos.salaryTable.map((s) => [s.unitId === brisa.id ? "BRISA" : "GERAL", Number(s.baseSalary), Number(s.minSalary)]).sort(), [["BRISA", 2300, 2300], ["GERAL", 2100, 2100]]);
  const chefe = await prisma.position.findFirstOrThrow({ where: { title: { equals: `Chefe Zeta ${TAG}`, mode: "insensitive" } }, include: { salaryTable: true } });
  assert.match(chefe.salaryTable[0].note!, /\(PJ\)/);
  // colaboradores
  const a = await prisma.employee.findFirstOrThrow({ where: { cpfHash: cpfHash(CPF.a) }, include: { department: true, salaries: true, benefits: { include: { benefit: true } } } });
  assert.equal(a.internalId, `BRISA-${TAG}1`);
  assert.equal(a.department.name, "A&B — Salão");
  assert.equal(a.weeklyHours, 44);
  assert.equal(Number(a.salaries[0].amount), 2300);
  assert.deepEqual(a.benefits.map((b) => b.benefit.code).sort(), ["FARMACIA", "PLANO_SAUDE", "VT"]);
  assert.match(a.benefits.find((b) => b.benefit.code === "VT")!.note!, /138,00/);
  const b = await prisma.employee.findFirstOrThrow({ where: { cpfHash: cpfHash(CPF.b) } });
  assert.equal(b.contractType, "APRENDIZ");
  const c = await prisma.employee.findFirstOrThrow({ where: { cpfHash: cpfHash(CPF.c) }, include: { department: true } });
  assert.equal(c.status, "DESLIGADO");
  assert.equal(c.terminationDate?.toISOString().slice(0, 10), "2026-09-12");
  assert.equal(c.department.name, "Recepção"); // portaria → recepção
  const dd = await prisma.employee.findFirstOrThrow({ where: { cpfHash: cpfHash(CPF.d) }, include: { department: true } });
  assert.equal(dd.status, "AFASTADO");
  assert.equal(dd.department.name, "Sala Nova"); // centro de custo desconhecido vira departamento
  // folha: salário pago, gorjeta, Elogio pago (sem recálculo), adicional; férias ignoradas
  const rep = await competenceReport(admin, "2026-09", { unidade: brisa.id });
  const ra = rep.rows.find((x) => x.id === a.id)!.comp;
  assert.equal(ra.basePaid, 2300);
  assert.equal(ra.variaveis, 640.5);
  assert.equal(ra.premiacoes, 200);
  assert.equal(ra.elogio, null);
  assert.equal(ra.adicionais, 120);
  // encargos: geral = mais frequente; Brisa com RAT próprio; aprendiz com FGTS 2%
  const rat = await prisma.chargeRate.findUniqueOrThrow({ where: { code: "RAT_FAP" }, include: { units: true } });
  assert.equal(Number(rat.ratePct), 2.067); // empate (1 a 1): primeira unidade
  const fgts = await prisma.chargeRate.findUniqueOrThrow({ where: { code: "FGTS" } });
  assert.deepEqual([Number(fgts.ratePct), Number(fgts.apprenticeRatePct)], [8, 2]);
  assert.ok(await prisma.clinic.findFirst({ where: { name: `Clínica Teste ${TAG}` } }));
  // reimportação: nada duplica
  const r2 = await applyCompanyData(admin, (await uploadCompanyData(admin, new File([buf], "carga.xlsx"))).documentId);
  assert.deepEqual([r2.stats.employeesCreated, r2.stats.positionsCreated, r2.stats.descriptors, r2.stats.floors, r2.stats.enrollments, r2.stats.terminated], [0, 0, 0, 0, 0, 0]);
  assert.equal(await prisma.payItem.count({ where: { employeeId: a.id, competence: "2026-09" } }), 4);
  assert.equal(await prisma.employeeSalary.count({ where: { employeeId: a.id } }), 1);
});
