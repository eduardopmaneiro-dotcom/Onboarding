/**
 * Carga de dados da empresa (planilha padronizada): cargos e descritivos do relatório institucional,
 * pisos salariais, quadro de colaboradores com salário, lançamentos da competência, adesões a benefícios
 * indicadas pelos descontos, alíquotas de encargos apuradas da folha e clínica ocupacional.
 * Fluxo: enviar (arquivo cifrado) → prévia (nada é gravado) → confirmar. Reimportar é idempotente.
 */
import ExcelJS from "exceljs";
import type { ContractType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { assertCan, type CurrentUser } from "@/lib/session";
import { cpfHash, isValidCpf, normalizeCpf, protectCpf } from "@/lib/cpf";
import { dateKey, localToDate } from "@/lib/datetime";
import { NotFoundError, ValidationError } from "@/modules/shared/errors";
import { readDocument, storeDocument } from "@/modules/documents/service";
import { createEmployeeTx } from "@/modules/people/service";
import { currentRule } from "@/modules/people/rule-settings";
import { competenceRange, isCompetence } from "@/modules/compensation/calc";
import { benefitFor, brDate, contractFor, departmentFor, norm, ratesFromTotals, rubricType, splitActivities, splitTitle, statusFor, titleCase } from "@/modules/dataimport/rules";

type Cell = string | number | null;
const text = (v: ExcelJS.CellValue): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "richText" in v) return v.richText.map((r) => r.text).join("");
  if (typeof v === "object" && "text" in v) return String(v.text);
  if (v instanceof Date) return `${String(v.getUTCDate()).padStart(2, "0")}/${String(v.getUTCMonth() + 1).padStart(2, "0")}/${v.getUTCFullYear()}`;
  return String(v);
};
const num = (v: Cell) => (v === null || v === "" ? null : typeof v === "number" ? v : Number(String(v).replace(/\./g, "").replace(",", ".")));

export type Parsed = Awaited<ReturnType<typeof parseWorkbook>>;

export async function parseWorkbook(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const rows = (name: string, required: string[]) => {
    const ws = wb.getWorksheet(name);
    if (!ws) throw new ValidationError(`Aba “${name}” não encontrada — use a planilha padronizada de carga`);
    const header = (ws.getRow(1).values as ExcelJS.CellValue[]).slice(1).map(text);
    for (const h of required) if (!header.includes(h)) throw new ValidationError(`Aba “${name}”: coluna “${h}” não encontrada`);
    const out: Array<Record<string, Cell>> = [];
    ws.eachRow((row, i) => {
      if (i === 1) return;
      const r: Record<string, Cell> = {};
      header.forEach((h, j) => { const v = row.getCell(j + 1).value; r[h] = typeof v === "number" ? v : text(v).trim() || null; });
      if (Object.values(r).some((x) => x !== null)) out.push(r);
    });
    return out;
  };
  const params = rows("Parâmetros", ["Competência", "Data do relatório de cargos"])[0] ?? {};
  const competence = String(params["Competência"] ?? "");
  if (!isCompetence(competence)) throw new ValidationError("Aba Parâmetros: competência inválida (use AAAA-MM)");
  const reportDate = String(params["Data do relatório de cargos"] ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) throw new ValidationError("Aba Parâmetros: data do relatório de cargos inválida (AAAA-MM-DD)");
  return {
    competence, reportDate, cargoSource: String(params["Fonte cargos"] ?? "Relatório de cargos"), payrollSource: String(params["Fonte folha"] ?? "Folha de pagamento"),
    cargos: rows("Cargos", ["Cargo", "Descrição", "Atividades", "Piso salarial", "CBO"]),
    colaboradores: rows("Colaboradores", ["Unidade", "Matrícula", "Nome", "CPF", "Admissão", "Situação", "Vínculo", "Cargo", "CBO", "Centro de custo", "Salário"]),
    rubricas: rows("Rubricas", ["Unidade", "Matrícula", "Código", "Rubrica", "Valor", "Tipo"]),
    encargos: rows("Encargos", ["Unidade", "Base INSS", "INSS empresa", "RAT", "Terceiros", "Base FGTS", "Valor FGTS"]),
    clinica: rows("Clínica", ["Nome"]),
  };
}

/** Plano de carga (sem gravar): o que será criado, atualizado, ignorado e por quê. */
export async function analyze(p: Parsed) {
  const units = await prisma.unit.findMany();
  const unitByCode = new Map(units.map((u) => [u.code, u]));
  const positions = await prisma.position.findMany({ select: { id: true, title: true, aliases: true, code: true } });
  const byNorm = new Map<string, string>();
  for (const pos of positions) { byNorm.set(norm(pos.title), pos.id); for (const a of pos.aliases) byNorm.set(norm(a), pos.id); }

  // Cargos do relatório agrupados pelo cargo-base (sem unidade/PJ)
  const groups = new Map<string, { display: string; variants: Array<{ title: string; unit: string | null; pj: boolean; profile: string | null; people: number; description: string; activities: string; floor: number | null; cbo: string }> }>();
  const errors: string[] = [];
  for (const c of p.cargos) {
    const title = String(c["Cargo"] ?? "").trim();
    if (!title) continue;
    const s = splitTitle(title);
    if (!s.base) { errors.push(`Cargo sem nome válido: “${title}”`); continue; }
    const g = groups.get(s.base) ?? { display: s.display, variants: [] };
    g.variants.push({ title, unit: s.unit, pj: s.pj, profile: (c["Perfil"] as string) ?? null, people: Number(c["Colaboradores"] ?? 0), description: String(c["Descrição"] ?? "").trim(), activities: String(c["Atividades"] ?? ""), floor: num(c["Piso salarial"]), cbo: String(c["CBO"] ?? "").split("-")[0].trim() });
    groups.set(s.base, g);
  }
  const positionPlan = [...groups.entries()].map(([base, g]) => {
    const main = [...g.variants].sort((a, b) => b.people - a.people || Number(!!a.unit) - Number(!!b.unit))[0];
    const existing = byNorm.get(base) ?? g.variants.map((v) => byNorm.get(norm(v.title))).find(Boolean) ?? null;
    return { base, title: existing ? null : titleCase(g.display), existingId: existing, main, variants: g.variants };
  });
  const planByNorm = new Map<string, (typeof positionPlan)[number]>();
  for (const pp of positionPlan) { planByNorm.set(pp.base, pp); for (const v of pp.variants) planByNorm.set(norm(v.title), pp); }

  // Colaboradores
  const people = p.colaboradores.map((r, i) => {
    const line = i + 2;
    const unit = unitByCode.get(String(r["Unidade"] ?? "").toUpperCase());
    const cpf = normalizeCpf(String(r["CPF"] ?? ""));
    const admission = brDate(r["Admissão"]);
    const contract = contractFor(String(r["Vínculo"] ?? ""));
    const status = statusFor(String(r["Situação"] ?? ""));
    const termination = brDate(r["Desligamento"]);
    const salary = num(r["Salário"]);
    const cargo = String(r["Cargo"] ?? "").trim();
    const cargoNorm = splitTitle(cargo).base;
    const plan = planByNorm.get(cargoNorm) ?? planByNorm.get(norm(cargo)) ?? null;
    const viaCbo = !plan && !byNorm.get(cargoNorm) ? positionPlan.filter((pp) => pp.variants.some((v) => v.cbo === String(r["CBO"] ?? ""))) : [];
    const problems = [
      !unit && `unidade “${r["Unidade"]}” desconhecida`, !isValidCpf(cpf) && "CPF inválido", !admission && "data de admissão inválida",
      !contract && `vínculo “${r["Vínculo"]}” não importado (somente celetista e aprendiz)`, (!salary || salary <= 0) && "salário inválido",
      status === "DESLIGADO" && !termination && "desligado sem data de desligamento",
    ].filter(Boolean) as string[];
    return {
      line, unit, matricula: String(r["Matrícula"] ?? ""), name: titleCase(String(r["Nome"] ?? "").trim()), cpf, admission, contract, status, termination,
      terminationNote: String(r["Origem da data de desligamento"] ?? ""), salary, cargo, cbo: String(r["CBO"] ?? ""), costCenter: String(r["Centro de custo"] ?? ""),
      department: departmentFor(String(r["Centro de custo"] ?? "")), hours: num(r["Horas mês"]),
      positionRef: plan ? { plan: plan.base } : byNorm.get(cargoNorm) ? { id: byNorm.get(cargoNorm)! } : viaCbo.length === 1 ? { plan: viaCbo[0].base } : { create: titleCase(splitTitle(cargo).display || cargo), cbo: String(r["CBO"] ?? "") },
      problems,
    };
  });
  const cpfSeen = new Map<string, number>();
  for (const x of people) { if (x.problems.length) continue; const n = (cpfSeen.get(x.cpf) ?? 0) + 1; cpfSeen.set(x.cpf, n); if (n > 1) x.problems.push("CPF repetido na planilha"); }
  const existingEmps = await prisma.employee.findMany({ where: { OR: [{ cpfHash: { in: people.filter((x) => isValidCpf(x.cpf)).map((x) => cpfHash(x.cpf)) } }, { internalId: { in: people.map((x) => `${String(x.unit?.code ?? "")}-${x.matricula}`) } }] }, select: { id: true, cpfHash: true, internalId: true, status: true } });

  // Rubricas
  const rubricSummary = new Map<string, { type: string; count: number; total: number }>();
  const benefitSignals = new Map<string, Set<string>>();
  for (const r of p.rubricas) {
    const desc = String(r["Rubrica"] ?? ""), tipo = String(r["Tipo"] ?? ""), key = `${r["Unidade"]}-${r["Matrícula"]}`;
    if (tipo === "P") {
      const t = rubricType(desc);
      const s = rubricSummary.get(desc) ?? { type: t, count: 0, total: 0 };
      s.count++; s.total += num(r["Valor"]) ?? 0;
      rubricSummary.set(desc, s);
    } else if (tipo === "D") {
      const b = benefitFor(desc);
      if (b) benefitSignals.set(b, (benefitSignals.get(b) ?? new Set()).add(key));
    }
  }
  const rates = p.encargos.map((e) => ({ unit: String(e["Unidade"]), ...ratesFromTotals({ baseInss: num(e["Base INSS"]) ?? 0, inssEmpresa: num(e["INSS empresa"]) ?? 0, rat: num(e["RAT"]) ?? 0, terceiros: num(e["Terceiros"]) ?? 0, baseFgts: num(e["Base FGTS"]) ?? 0, fgts: num(e["Valor FGTS"]) ?? 0, baseFgtsAprendiz: num(e["Base FGTS aprendiz"]) ?? 0, fgtsAprendiz: num(e["Valor FGTS aprendiz"]) ?? 0 }) }));
  const ok = people.filter((x) => !x.problems.length);
  return {
    competence: p.competence,
    positions: { total: positionPlan.length, newPositions: positionPlan.filter((x) => !x.existingId).map((x) => x.title!), existing: positionPlan.filter((x) => x.existingId).length, floors: positionPlan.reduce((s, x) => s + x.variants.filter((v) => v.floor).length, 0) },
    people: {
      total: people.length, ok: ok.length,
      new: ok.filter((x) => !existingEmps.some((e) => e.cpfHash === cpfHash(x.cpf) || e.internalId === `${x.unit!.code}-${x.matricula}`)).length,
      terminated: ok.filter((x) => x.status === "DESLIGADO").length, onLeave: ok.filter((x) => x.status === "AFASTADO").length, apprentices: ok.filter((x) => x.contract === "APRENDIZ").length,
      byUnit: Object.fromEntries([...new Set(ok.map((x) => x.unit!.name))].map((u) => [u, ok.filter((x) => x.unit!.name === u).length])),
      positionsFromPayroll: [...new Set(ok.filter((x) => "create" in x.positionRef).map((x) => (x.positionRef as { create: string }).create))],
      departments: [...new Set(ok.map((x) => `${x.costCenter} → ${x.department}`))].sort(),
      problems: people.filter((x) => x.problems.length).map((x) => ({ line: x.line, name: x.name, problems: x.problems })),
    },
    rubrics: [...rubricSummary.entries()].map(([desc, s]) => ({ desc, ...s, total: Math.round(s.total * 100) / 100 })).sort((a, b) => a.type.localeCompare(b.type) || b.total - a.total),
    benefits: [...benefitSignals.entries()].map(([code, set]) => ({ code, people: set.size })),
    rates, clinic: p.clinica[0]?.["Nome"] ?? null, errors,
    _internal: { positionPlan, people, existingEmps },
  };
}
export type Analysis = Awaited<ReturnType<typeof analyze>>;

export function assertImporter(user: CurrentUser) {
  assertCan(user, "dados.importar");
}

/** Guarda o arquivo cifrado (contém dados pessoais) e devolve a prévia. */
export async function uploadCompanyData(user: CurrentUser, file: File) {
  assertImporter(user);
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new ValidationError("Envie a planilha padronizada (.xlsx)", { file: ["Formato .xlsx"] });
  const buf = Buffer.from(await file.arrayBuffer());
  const parsed = await parseWorkbook(buf);
  const doc = await storeDocument(user, { ownerType: "DataImport", ownerId: "pendente", category: "carga-empresa", file, classification: "SENSIVEL" });
  const a = await analyze(parsed);
  const { _internal, ...preview } = a;
  void _internal;
  return { documentId: doc.id, fileName: file.name, preview };
}

export async function previewStored(user: CurrentUser, documentId: string) {
  assertImporter(user);
  const { doc, data } = await readDocument(user, documentId);
  if (doc.ownerType !== "DataImport") throw new NotFoundError("Arquivo não encontrado");
  const { _internal, ...preview } = await analyze(await parseWorkbook(data));
  void _internal;
  return { documentId, fileName: doc.originalName, preview };
}

/** Aplica a carga. Idempotente: colaboradores casam por CPF/matrícula; lançamentos da competência são substituídos. */
export async function applyCompanyData(user: CurrentUser, documentId: string) {
  assertImporter(user);
  const { doc, data } = await readDocument(user, documentId);
  if (doc.ownerType !== "DataImport") throw new NotFoundError("Arquivo não encontrado");
  const parsed = await parseWorkbook(data);
  const a = await analyze(parsed);
  const { positionPlan, people } = a._internal;
  const { from } = competenceRange(parsed.competence);
  const sourceRef = `${parsed.cargoSource}`;
  const rule = await currentRule();
  const stats = { positionsCreated: 0, positionsUpdated: 0, descriptors: 0, descriptorsKept: 0, floors: 0, departmentsCreated: 0, employeesCreated: 0, employeesUpdated: 0, terminated: 0, payItems: 0, enrollments: 0, rates: 0, skipped: a.people.problems.length };

  // 1) Cargos, descritivos e pisos
  const posId = new Map<string, string>();
  // vários grupos do relatório podem cair no mesmo cargo: o descritivo vem da variação com mais colaboradores
  const bestFor = new Map<string, (typeof positionPlan)[number]["main"]>();
  for (const pp of positionPlan) if (pp.existingId) { const cur = bestFor.get(pp.existingId); if (!cur || pp.main.people > cur.people) bestFor.set(pp.existingId, pp.main); }
  const described = new Set<string>();
  for (const pp of positionPlan) {
    let id = pp.existingId;
    const aliases = pp.variants.map((v) => v.title);
    const cbo = pp.main.cbo || null;
    if (id) {
      const cur = await prisma.position.findUniqueOrThrow({ where: { id } });
      await prisma.position.update({ where: { id }, data: { aliases: [...new Set([...cur.aliases, ...aliases])], cbo: cur.cbo ?? cbo } });
      stats.positionsUpdated++;
    } else {
      id = (await prisma.position.create({ data: { title: pp.title!, level: "N1", levelConfirmed: false, cbo, aliases } })).id;
      stats.positionsCreated++;
    }
    posId.set(pp.base, id);
    const main = bestFor.get(id) ?? pp.main;
    const current = described.has(id) ? null : await prisma.jobDescription.findFirst({ where: { positionId: id, status: "VIGENTE" } });
    if (described.has(id)) { /* já tratado nesta carga */ }
    else if (current && current.sourceRef !== sourceRef) stats.descriptorsKept++; // descritivo cadastrado manualmente é preservado
    else if (!current || (current.objective ?? "") !== (main.description ?? "")) {
      const version = ((await prisma.jobDescription.aggregate({ where: { positionId: id }, _max: { version: true } }))._max.version ?? 0) + 1;
      await prisma.$transaction([
        prisma.jobDescription.updateMany({ where: { positionId: id, status: "VIGENTE" }, data: { status: "ARQUIVADO" } }),
        prisma.jobDescription.create({ data: { positionId: id, version, status: "VIGENTE", objective: main.description || null, responsibilities: splitActivities(main.activities), behavioralProfile: main.profile, sourceRef, effectiveFrom: localToDate(parsed.reportDate), approvedById: user.id, approvedAt: new Date(), createdById: user.id } }),
      ]);
      stats.descriptors++;
    }
    described.add(id);
    for (const v of pp.variants) {
      if (!v.floor || v.floor <= 0) continue;
      const unitId = v.unit ? (await prisma.unit.findUnique({ where: { code: v.unit } }))?.id ?? null : null;
      const exists = await prisma.positionSalary.findFirst({ where: { positionId: id, unitId, effectiveFrom: localToDate(parsed.reportDate) } });
      if (exists) continue; // mesma vigência: variações repetidas no relatório não duplicam
      await prisma.positionSalary.create({ data: { positionId: id, unitId, baseSalary: v.floor, minSalary: v.floor, effectiveFrom: localToDate(parsed.reportDate), note: `Piso salarial — ${sourceRef}${v.pj ? " (PJ)" : ""} — “${v.title}”`, createdById: user.id } });
      stats.floors++;
    }
  }

  // 2) Departamentos e colaboradores
  const deptCache = new Map<string, string>();
  const dept = async (unitId: string, name: string) => {
    const k = `${unitId}|${name}`;
    if (deptCache.has(k)) return deptCache.get(k)!;
    let d = await prisma.department.findFirst({ where: { unitId, name } });
    if (!d) { d = await prisma.department.create({ data: { unitId, name } }); stats.departmentsCreated++; }
    deptCache.set(k, d.id);
    return d.id;
  };
  const resolvePosition = async (ref: (typeof people)[number]["positionRef"]): Promise<string> => {
    if ("id" in ref && ref.id) return ref.id;
    if ("plan" in ref && ref.plan) return posId.get(ref.plan)!;
    const r = ref as { create: string; cbo: string };
    const found = await prisma.position.findFirst({ where: { OR: [{ title: r.create }, { aliases: { has: r.create } }] } });
    if (found) return found.id;
    stats.positionsCreated++;
    return (await prisma.position.create({ data: { title: r.create, level: "N1", levelConfirmed: false, cbo: r.cbo || null, aliases: [r.create] } })).id;
  };
  const empByKey = new Map<string, string>();
  for (const x of people.filter((y) => !y.problems.length)) {
    const unit = x.unit!;
    const departmentId = await dept(unit.id, x.department);
    const positionId = await resolvePosition(x.positionRef);
    const internalId = `${unit.code}-${x.matricula}`;
    const hash = cpfHash(x.cpf);
    const existing = await prisma.employee.findFirst({ where: { OR: [{ cpfHash: hash, status: { not: "DESLIGADO" } }, { internalId }] } });
    const effective = x.admission! > from ? x.admission! : from;
    const weeklyHours = x.hours ? Math.round(x.hours / 5) : null;
    let empId: string;
    if (!existing) {
      const emp = await prisma.$transaction((tx) => createEmployeeTx(tx, user, {
        fullName: x.name, ...protectCpf(x.cpf), contractType: x.contract as ContractType, origin: "CADASTRO_DIRETO", departmentId, positionId,
        weeklyHours, internalId, admission: x.admission!,
      }, rule, { onlyFutureMilestones: true }));
      empId = emp.id;
      stats.employeesCreated++;
    } else {
      empId = existing.id;
      if (existing.positionId !== positionId || existing.departmentId !== departmentId) {
        await prisma.$transaction([
          prisma.employee.update({ where: { id: empId }, data: { positionId, departmentId } }),
          prisma.movementHistory.create({ data: { employeeId: empId, type: existing.positionId !== positionId ? "MUDANCA_CARGO" : "TRANSFERENCIA_DEPARTAMENTO", effectiveDate: localToDate(from), fromPositionId: existing.positionId, toPositionId: positionId, fromDepartmentId: existing.departmentId, toDepartmentId: departmentId, reason: `Atualizado pela carga da folha ${parsed.competence}`, recordedById: user.id } }),
        ]);
      }
      stats.employeesUpdated++;
    }
    empByKey.set(`${unit.code}-${x.matricula}`, empId);
    // salário contratual da competência (histórico somente inserção: só grava se mudou)
    const last = await prisma.employeeSalary.findFirst({ where: { employeeId: empId }, orderBy: { effectiveFrom: "desc" } });
    if (!last || Number(last.amount) !== x.salary) await prisma.employeeSalary.create({ data: { employeeId: empId, amount: x.salary!, effectiveFrom: localToDate(effective), reason: `Salário contratual — ${parsed.payrollSource}`, createdById: user.id } });
    const cur = await prisma.employee.findUniqueOrThrow({ where: { id: empId } });
    if (x.status === "AFASTADO" && cur.status === "ATIVO") await prisma.employee.update({ where: { id: empId }, data: { status: "AFASTADO" } });
    if (x.status === "ATIVO" && cur.status === "AFASTADO") await prisma.employee.update({ where: { id: empId }, data: { status: "ATIVO" } });
    if (x.status === "DESLIGADO" && cur.status !== "DESLIGADO") {
      await prisma.$transaction([
        prisma.employee.update({ where: { id: empId }, data: { status: "DESLIGADO", terminationDate: localToDate(x.termination!), terminationType: "OUTRO", terminationReason: `Desligado na ${parsed.payrollSource}${x.terminationNote ? ` (data: ${x.terminationNote})` : ""} — tipo a confirmar` } }),
        prisma.probationMilestone.updateMany({ where: { employeeId: empId, status: "PENDENTE" }, data: { status: "ENCERRADO_DESLIGAMENTO" } }),
        prisma.movementHistory.create({ data: { employeeId: empId, type: "DESLIGAMENTO", effectiveDate: localToDate(x.termination!), fromPositionId: positionId, fromDepartmentId: departmentId, reason: `Desligamento importado da folha ${parsed.competence}`, recordedById: user.id } }),
      ]);
      stats.terminated++;
    }
  }

  // 3) Lançamentos da competência (substitui os importados antes) e adesões indicadas por descontos
  const types = new Map((await prisma.payItemType.findMany()).map((t) => [t.code, t.id]));
  const perEmp = new Map<string, Map<string, { amount: number; rubrics: Set<string> }>>();
  const benefitsPerEmp = new Map<string, Map<string, number>>();
  for (const r of parsed.rubricas) {
    const empId = empByKey.get(`${r["Unidade"]}-${r["Matrícula"]}`);
    if (!empId) continue;
    const desc = String(r["Rubrica"] ?? ""), value = num(r["Valor"]) ?? 0;
    if (r["Tipo"] === "P") {
      const t = rubricType(desc);
      if (t === "IGNORAR" || !types.has(t) || value <= 0) continue;
      const m = perEmp.get(empId) ?? new Map();
      const cur = m.get(t) ?? { amount: 0, rubrics: new Set<string>() };
      cur.amount += value; cur.rubrics.add(`${r["Código"]} ${desc}`);
      m.set(t, cur); perEmp.set(empId, m);
    } else if (r["Tipo"] === "D") {
      const b = benefitFor(desc);
      if (!b) continue;
      const m = benefitsPerEmp.get(empId) ?? new Map();
      m.set(b, (m.get(b) ?? 0) + value); benefitsPerEmp.set(empId, m);
    }
  }
  for (const [empId, m] of perEmp) {
    await prisma.payItem.deleteMany({ where: { employeeId: empId, competence: parsed.competence, source: "FOLHA" } });
    await prisma.payItem.createMany({ data: [...m.entries()].map(([t, v]) => ({ employeeId: empId, typeId: types.get(t)!, competence: parsed.competence, amount: Math.round(v.amount * 100) / 100, source: "FOLHA", rubric: [...v.rubrics].join("; ").slice(0, 300), description: `Importado da ${parsed.payrollSource}`, createdById: user.id })) });
    stats.payItems += m.size;
  }
  const benefits = new Map((await prisma.benefit.findMany()).map((b) => [b.code, b]));
  for (const [empId, m] of benefitsPerEmp) {
    const emp = await prisma.employee.findUniqueOrThrow({ where: { id: empId } });
    for (const [code, discount] of m) {
      const b = benefits.get(code);
      if (!b || (await prisma.employeeBenefit.findFirst({ where: { employeeId: empId, benefitId: b.id, endDate: null } }))) continue;
      const start = dateKey(emp.admissionDate) > from ? dateKey(emp.admissionDate) : from;
      await prisma.employeeBenefit.create({ data: { employeeId: empId, benefitId: b.id, startDate: localToDate(start), note: `Adesão indicada pelo desconto na ${parsed.payrollSource}: R$ ${discount.toFixed(2).replace(".", ",")} descontados do colaborador`, createdById: user.id } });
      stats.enrollments++;
    }
  }
  // fatos institucionais da folha sobre os benefícios (só preenche o que está vazio)
  const vt = benefits.get("VT");
  if (vt && vt.discountValue === null && benefitsPerEmp.size) await prisma.benefit.update({ where: { id: vt.id }, data: { discountType: "PERCENTUAL_SALARIO", discountValue: 6, valueSource: vt.valueSource ?? `${parsed.payrollSource} (rubrica “VALE TRANSPORTE - 6%”)` } });
  const farmUnits = new Set(parsed.rubricas.filter((r) => r["Tipo"] === "D" && benefitFor(String(r["Rubrica"] ?? "")) === "FARMACIA").map((r) => String(r["Unidade"])));
  const farm = benefits.get("FARMACIA");
  if (farm && farmUnits.size && !(await prisma.benefitUnit.count({ where: { benefitId: farm.id } }))) {
    for (const code of farmUnits) { const u = await prisma.unit.findUnique({ where: { code } }); if (u) await prisma.benefitUnit.create({ data: { benefitId: farm.id, unitId: u.id } }); }
    await prisma.benefit.update({ where: { id: farm.id }, data: { allUnits: false } });
  }
  const saude = benefits.get("PLANO_SAUDE"), odonto = benefits.get("PLANO_ODONTO");
  if (saude && !saude.provider && parsed.rubricas.some((r) => /intermedica/i.test(String(r["Rubrica"])))) await prisma.benefit.update({ where: { id: saude.id }, data: { provider: "Intermédica" } });
  if (odonto && !odonto.provider && parsed.rubricas.some((r) => /odontoprev/i.test(String(r["Rubrica"])))) await prisma.benefit.update({ where: { id: odonto.id }, data: { provider: "OdontoPrev" } });

  // 4) Alíquotas de encargos apuradas da folha (geral = valor mais frequente; diferentes viram alíquota da unidade)
  const rateRows = await prisma.chargeRate.findMany();
  for (const code of ["INSS_PATRONAL", "RAT_FAP", "TERCEIROS", "FGTS"] as const) {
    const vals = a.rates.filter((x) => x[code] !== null).map((x) => ({ unit: x.unit, v: x[code] as number }));
    const rate = rateRows.find((r) => r.code === code);
    if (!rate || !vals.length) continue;
    const freq = new Map<number, number>(); vals.forEach((x) => freq.set(x.v, (freq.get(x.v) ?? 0) + 1));
    const general = [...freq.entries()].sort((x, y) => y[1] - x[1])[0][0];
    const apprentice = code === "FGTS" ? a.rates.map((x) => x.FGTS_APRENDIZ).find((v) => v !== null) ?? null : undefined;
    await prisma.chargeRate.update({ where: { id: rate.id }, data: { ratePct: general, ...(apprentice !== undefined ? { apprenticeRatePct: apprentice } : {}), legalRef: `${rate.legalRef?.split(" — apurado")[0] ?? ""} — apurado da ${parsed.payrollSource}: ${vals.map((x) => `${x.unit} ${String(x.v).replace(".", ",")}%`).join(", ")}`, updatedById: user.id } });
    for (const x of vals) {
      const u = await prisma.unit.findUnique({ where: { code: x.unit } });
      if (!u) continue;
      if (x.v !== general) await prisma.chargeRateUnit.upsert({ where: { rateId_unitId: { rateId: rate.id, unitId: u.id } }, update: { ratePct: x.v }, create: { rateId: rate.id, unitId: u.id, ratePct: x.v } });
      else await prisma.chargeRateUnit.deleteMany({ where: { rateId: rate.id, unitId: u.id } });
    }
    stats.rates++;
  }

  // 5) Clínica ocupacional (contrato)
  const c = parsed.clinica[0];
  if (c?.["Nome"]) {
    const name = String(c["Nome"]).slice(0, 120);
    const existing = await prisma.clinic.findFirst({ where: { name } });
    if (!existing) await prisma.clinic.create({ data: { name, address: (c["Endereço"] as string) ?? null, phone: (c["Telefone"] as string) ?? null } });
  }

  const rec = await prisma.dataImport.create({ data: { kind: "CARGA_EMPRESA", fileName: doc.originalName, sha256: doc.sha256, competence: parsed.competence, summary: stats as unknown as Prisma.InputJsonValue, createdById: user.id } });
  await prisma.document.update({ where: { id: documentId }, data: { ownerId: rec.id } });
  await recordAudit({ entityType: "DataImport", entityId: rec.id, action: "CREATE", actorId: user.id, actorRole: user.role, newValue: stats });
  return { id: rec.id, stats };
}

export async function listImports(user: CurrentUser) {
  assertImporter(user);
  return prisma.dataImport.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
}
