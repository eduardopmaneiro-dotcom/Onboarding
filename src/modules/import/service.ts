import type { ImportRowStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { sha256 } from "@/lib/crypto";
import { assertCan, type CurrentUser } from "@/lib/session";
import { localToDate } from "@/lib/datetime";
import { normalizePhone, normalizeText, tidyName } from "@/lib/text";
import { NotFoundError, ValidationError } from "@/modules/shared/errors";
import { recordEvent } from "@/modules/recruitment/events";
import { nextJobCode } from "@/modules/recruitment/jobs";
import { OUTCOME_LABEL, OUTCOME_EFFECT, cleanCandidateName, expandPositionText, extractSalaries, interpretOutcome, suggestField, suggestReason, tidyInterviewer, type ImportField, type Outcome } from "@/modules/import/rules";
import { parseDateText, parseSpreadsheet, parseTimeText } from "@/modules/import/parse";

export type ColumnMap = Record<string, ImportField>;
export type ValueMap = {
  unidade: Record<string, string>; // valor normalizado → unitId ("" = não identificado)
  vaga: Record<string, { positionId: string; newTitle?: string; departmentName: string }>; // positionId "NEW" = criar cargo
  recrutador: Record<string, string>; // valor → userId ("" = manter só o nome)
  resultado: Record<string, Outcome>;
  motivo: Record<string, string>; // valor → código do motivo ("" = apenas observação)
};

type NormalizedRow = {
  unitId: string | null;
  unitName: string | null;
  date: string | null;
  time: string | null;
  name: string;
  nameKey: string;
  stage: number | null;
  phone: string | null;
  email: string | null;
  vagaKey: string;
  positionId: string | null;
  positionTitle: string | null;
  departmentName: string | null;
  departmentId: string | null;
  interviewerName: string | null;
  interviewerUserId: string | null;
  outcome: Outcome;
  outcomeLabel: string;
  reasonCode: string | null;
  note: string | null;
  lastSalary?: number;
  expectedSalary?: number;
  resultText: string;
  motivoText: string;
};

const MAX_FILE_MB = 10;

// ═════════════════════════ 1. CARREGAR ═════════════════════════

export async function uploadSpreadsheet(user: CurrentUser, file: File) {
  assertCan(user, "importacao.executar");
  if (!file || file.size === 0) throw new ValidationError("Selecione a planilha", { file: ["Arquivo vazio"] });
  if (file.size > MAX_FILE_MB * 1024 * 1024) throw new ValidationError(`Planilha acima de ${MAX_FILE_MB} MB`);
  const name = file.name.toLowerCase();
  if (!/\.(xlsx|csv|txt)$/.test(name)) throw new ValidationError("Formato não suportado. Use .xlsx (Excel / Google Planilhas › Baixar › .xlsx) ou .csv");
  const buf = Buffer.from(await file.arrayBuffer());
  const hash = sha256(buf);
  const parsed = await parseSpreadsheet(file.name, buf).catch(() => {
    throw new ValidationError("Não foi possível ler a planilha. Confira se o arquivo não está protegido por senha.");
  });
  if (!parsed.rows.length) throw new ValidationError("Nenhuma linha com dados foi encontrada na planilha");

  const columnMap: ColumnMap = Object.fromEntries(parsed.headers.map((h) => [h, suggestField(h)]));
  const previous = await prisma.importBatch.findFirst({ where: { sha256: hash, status: "IMPORTADO" } });

  const batch = await prisma.importBatch.create({
    data: {
      fileName: file.name.slice(0, 200),
      sha256: hash,
      sheetName: parsed.sheetName,
      headers: parsed.headers,
      columnMap,
      totalRows: parsed.rows.length,
      createdById: user.id,
      summary: previous ? { aviso: `Este mesmo arquivo já foi importado em ${previous.committedAt?.toLocaleDateString("pt-BR")}. As linhas já importadas serão identificadas como “já existe”.` } : undefined,
      rows: { create: parsed.rows.map((r) => ({ rowNumber: r.rowNumber, raw: r.values })) },
    },
  });
  await recordAudit({ entityType: "ImportBatch", entityId: batch.id, action: "CREATE", actorId: user.id, actorRole: user.role, newValue: { arquivo: batch.fileName, linhas: batch.totalRows } });
  await buildValueMap(user, batch.id);
  return batch;
}

async function loadBatch(user: CurrentUser, id: string) {
  assertCan(user, "importacao.executar");
  const b = await prisma.importBatch.findUnique({ where: { id }, include: { rows: { orderBy: { rowNumber: "asc" } } } });
  if (!b) throw new NotFoundError("Importação não encontrada");
  return b;
}

function colOf(map: ColumnMap, field: ImportField): string | null {
  return Object.entries(map).find(([, f]) => f === field)?.[0] ?? null;
}

// ═════════════════════════ 2. MAPEAR ═════════════════════════

export async function saveColumnMap(user: CurrentUser, id: string, map: ColumnMap) {
  const b = await loadBatch(user, id);
  if (b.status === "IMPORTADO") throw new ValidationError("Importação já concluída");
  const required: ImportField[] = ["candidato", "data", "vaga", "resultado"];
  const missing = required.filter((f) => !Object.values(map).includes(f));
  if (missing.length) throw new ValidationError(`Indique as colunas obrigatórias: ${missing.join(", ")}`);
  await prisma.importBatch.update({ where: { id }, data: { columnMap: map, status: "CARREGADO" } });
  await buildValueMap(user, id);
}

/** Sugere o mapeamento de cada valor distinto (unidade, cargo, recrutador, resultado, motivo). */
export async function buildValueMap(user: CurrentUser, id: string) {
  const b = await loadBatch(user, id);
  const cm = (b.columnMap ?? {}) as ColumnMap;
  const prev = (b.valueMap ?? {}) as Partial<ValueMap>;
  const get = (row: { raw: Prisma.JsonValue }, f: ImportField) => {
    const c = colOf(cm, f);
    return c ? String((row.raw as Record<string, string>)[c] ?? "") : "";
  };
  const [units, positions, users, departments] = await Promise.all([
    prisma.unit.findMany({ where: { active: true } }),
    prisma.position.findMany({ where: { active: true } }),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true } }),
    prisma.department.findMany({ where: { active: true }, select: { name: true }, distinct: ["name"] }),
  ]);
  const vm: ValueMap = { unidade: {}, vaga: {}, recrutador: {}, resultado: {}, motivo: {} };

  for (const row of b.rows) {
    const u = normalizeText(get(row, "unidade"));
    if (u && !(u in vm.unidade)) {
      const hit = units.find((x) => normalizeText(x.name) === u || normalizeText(x.code) === u || u.includes(normalizeText(x.name)));
      vm.unidade[u] = prev.unidade?.[u] ?? hit?.id ?? "";
    }
    const v = normalizeText(get(row, "vaga"));
    if (v && !(v in vm.vaga)) {
      const expanded = expandPositionText(v);
      const hit =
        positions.find((p) => normalizeText(p.title) === v || p.aliases.some((a) => normalizeText(a) === v)) ??
        positions.find((p) => normalizeText(p.title) === expanded || p.aliases.some((a) => normalizeText(a) === expanded));
      const deptHint = colOf(cm, "departamento") ? normalizeText(get(row, "departamento")) : "";
      const deptName = departments.find((d) => normalizeText(d.name) === deptHint)?.name ?? hit?.defaultDepartmentName ?? "";
      vm.vaga[v] = prev.vaga?.[v] ?? (hit ? { positionId: hit.id, departmentName: deptName } : { positionId: "NEW", newTitle: tidyName(expanded), departmentName: deptName });
    }
    const r = tidyInterviewer(get(row, "recrutador"));
    const rk = normalizeText(r.display);
    if (rk && !(rk in vm.recrutador)) {
      const first = normalizeText(r.primary).split(" ")[0];
      const hit = users.filter((x) => normalizeText(x.name).split(" ")[0] === first);
      vm.recrutador[rk] = prev.recrutador?.[rk] ?? (hit.length === 1 ? hit[0].id : "");
    }
    const res = get(row, "resultado");
    const mot = get(row, "motivo");
    const rkey = normalizeText(res);
    if (!(rkey in vm.resultado)) vm.resultado[rkey] = prev.resultado?.[rkey] ?? interpretOutcome(res).outcome;
    const mk = normalizeText(mot);
    if (mk && !(mk in vm.motivo)) {
      const outcome = interpretOutcome(res, mot).outcome;
      vm.motivo[mk] = prev.motivo?.[mk] ?? suggestReason(mot, outcome) ?? "";
    }
  }
  await prisma.importBatch.update({ where: { id }, data: { valueMap: vm } });
  await analyze(user, id);
  return vm;
}

export async function saveValueMap(user: CurrentUser, id: string, vm: ValueMap) {
  const b = await loadBatch(user, id);
  if (b.status === "IMPORTADO") throw new ValidationError("Importação já concluída");
  await prisma.importBatch.update({ where: { id }, data: { valueMap: vm } });
  await analyze(user, id);
}

// ═════════════════════════ 3. ANALISAR ═════════════════════════

/** Normaliza cada linha, aponta inconsistências e duplicidades. Nada é gravado em candidatos ainda. */
export async function analyze(user: CurrentUser, id: string) {
  const b = await loadBatch(user, id);
  const cm = (b.columnMap ?? {}) as ColumnMap;
  const vm = (b.valueMap ?? { unidade: {}, vaga: {}, recrutador: {}, resultado: {}, motivo: {} }) as ValueMap;
  const [units, positions, users, departments] = await Promise.all([
    prisma.unit.findMany(),
    prisma.position.findMany(),
    prisma.user.findMany({ select: { id: true, name: true } }),
    prisma.department.findMany({ where: { active: true } }),
  ]);
  const get = (raw: Prisma.JsonValue, f: ImportField) => {
    const c = colOf(cm, f);
    return c ? String((raw as Record<string, string>)[c] ?? "").trim() : "";
  };

  const seenInFile = new Map<string, number>(); // chave de entrevista → linha
  const counts: Record<string, number> = {};
  const updates: Array<{ id: string; normalized: NormalizedRow; status: ImportRowStatus; issues: string[]; decision: string; ignoreReason: string | null }> = [];

  for (const row of b.rows) {
    if (row.status === "IMPORTADO") continue;
    const issues: string[] = [];
    let status: ImportRowStatus = "OK";
    const { name, stage } = cleanCandidateName(get(row.raw, "candidato"));
    const uKey = normalizeText(get(row.raw, "unidade"));
    const unitId = vm.unidade[uKey] || null;
    const unit = units.find((x) => x.id === unitId) ?? null;
    const date = parseDateText(get(row.raw, "data"));
    const time = parseTimeText(get(row.raw, "hora")) ?? (get(row.raw, "data").match(/\d{2}:\d{2}/)?.[0] ?? null);
    const vKey = normalizeText(get(row.raw, "vaga"));
    const vMap = vm.vaga[vKey];
    const pos = vMap && vMap.positionId !== "NEW" ? positions.find((p) => p.id === vMap.positionId) ?? null : null;
    const deptName = vMap?.departmentName || pos?.defaultDepartmentName || null;
    const dept = unit && deptName ? departments.find((d) => d.unitId === unit.id && normalizeText(d.name) === normalizeText(deptName)) ?? null : null;
    const rec = tidyInterviewer(get(row.raw, "recrutador"));
    const recUserId = vm.recrutador[normalizeText(rec.display)] || null;
    const resultText = get(row.raw, "resultado");
    const motivoText = get(row.raw, "motivo");
    const interp = interpretOutcome(resultText, motivoText);
    // valor escolhido pelo RH prevalece; ajustes vindos do motivo continuam valendo quando o RH não alterou
    const chosen = vm.resultado[normalizeText(resultText)];
    const outcome: Outcome = chosen && chosen !== interpretOutcome(resultText).outcome ? chosen : interp.outcome;
    const reasonCode = (motivoText ? vm.motivo[normalizeText(motivoText)] || null : null) ?? suggestReason(motivoText, outcome);
    const salaries = extractSalaries(motivoText);
    const obs = get(row.raw, "observacao");
    const notes = [resultText && `Resultado na planilha: “${resultText}”`, motivoText && `Motivo na planilha: “${motivoText}”`, obs && `Observação: ${obs}`].filter(Boolean).join(" · ");

    if (!name) { issues.push("Nome do candidato vazio"); status = "INCONSISTENTE"; }
    else if (name.split(" ").length < 2) issues.push("Nome incompleto (só o primeiro nome)");
    if (!date) { issues.push(`Data inválida ou vazia (“${get(row.raw, "data")}”)`); status = "INCONSISTENTE"; }
    if (!unit) { issues.push(`Unidade não identificada (“${get(row.raw, "unidade")}”)`); status = "INCONSISTENTE"; }
    if (!vMap) { issues.push("Vaga/cargo vazio"); status = "INCONSISTENTE"; }
    else if (vMap.positionId === "NEW") issues.push(`Cargo novo será criado no catálogo: “${vMap.newTitle}”`);
    if (unit && vMap && !dept) { issues.push(`Departamento “${deptName ?? "?"}” não existe na unidade ${unit.name}`); status = "INCONSISTENTE"; }
    if (!interp.recognized && !chosen) issues.push(`Resultado não reconhecido (“${resultText}”) — tratado como pendente`);
    if (OUTCOME_EFFECT[outcome].rh === "REPROVADO" && (!reasonCode || reasonCode === "NAO_INFORMADO")) issues.push("Reprovação sem motivo na planilha — registrada como “Não informado”");
    if (!colOf(cm, "telefone") || !normalizePhone(get(row.raw, "telefone"))) issues.push("Sem telefone");
    if (salaries.lastSalary || salaries.expectedSalary) issues.push("Valor salarial extraído do texto — confira no cadastro");

    const nameKey = normalizeText(name);
    const groupKey = nameKey.split(" ").length < 2 ? `${nameKey}|${unitId}|${vKey}` : nameKey; // nome curto: não mistura pessoas diferentes
    const ivKey = `${groupKey}|${date}|${pos?.id ?? vKey}|${stage ?? 1}`;
    let decision = "IMPORTAR";
    let ignoreReason: string | null = null;
    if (status !== "INCONSISTENTE" && seenInFile.has(ivKey)) {
      status = "DUPLICADO_ARQUIVO";
      decision = "IGNORAR";
      ignoreReason = `Mesma entrevista da linha ${seenInFile.get(ivKey)} (mesmo candidato, cargo e data)`;
    } else if (status !== "INCONSISTENTE") seenInFile.set(ivKey, row.rowNumber);

    if ((status as ImportRowStatus) === "OK" || (status as ImportRowStatus) === "ALERTA") {
      // Já existe no sistema? (mesmo nome + mesma data de entrevista = já importado; só mesmo nome = vincular)
      const existing = nameKey ? await prisma.candidate.findFirst({ where: { nameNormalized: nameKey }, include: { applications: { include: { interviews: true } } } }) : null;
      if (existing) {
        const sameIv = existing.applications.some((a) => a.interviews.some((i) => date && i.scheduledAt.toISOString().slice(0, 10) === date));
        status = "JA_EXISTE";
        if (sameIv) { decision = "IGNORAR"; ignoreReason = "Entrevista já registrada no sistema (importação anterior ou cadastro manual)"; }
        else { decision = "VINCULAR"; issues.push("Candidato com o mesmo nome já existe — a entrevista será vinculada a ele"); }
      } else if (issues.length) status = "ALERTA";
    }
    if (status === "INCONSISTENTE") { decision = "IGNORAR"; ignoreReason = "Inconsistência que impede a importação: " + issues.filter((i) => /vazio|inválida|não identificada|não existe/.test(i)).join("; "); }

    counts[status] = (counts[status] ?? 0) + 1;
    updates.push({
      id: row.id,
      status,
      issues,
      decision: row.decision && row.status === status ? row.decision : decision,
      ignoreReason,
      normalized: {
        unitId, unitName: unit?.name ?? null, date, time, name: tidyName(name), nameKey: groupKey, stage,
        phone: normalizePhone(get(row.raw, "telefone")), email: get(row.raw, "email") || null,
        vagaKey: vKey, positionId: pos?.id ?? null, positionTitle: pos?.title ?? vMap?.newTitle ?? null, departmentName: deptName, departmentId: dept?.id ?? null,
        interviewerName: rec.display || null, interviewerUserId: recUserId && users.some((u) => u.id === recUserId) ? recUserId : null,
        outcome, outcomeLabel: OUTCOME_LABEL[outcome], reasonCode, note: notes || null, ...salaries, resultText, motivoText,
      },
    });
  }
  await prisma.$transaction(
    async (tx) => {
      for (const u of updates)
        await tx.importRow.update({ where: { id: u.id }, data: { status: u.status, issues: u.issues, decision: u.decision, ignoreReason: u.ignoreReason, normalized: u.normalized as unknown as Prisma.InputJsonValue } });
    },
    { timeout: 60_000 }
  );
  const prevSummary = (b.summary ?? {}) as Record<string, unknown>;
  await prisma.importBatch.update({ where: { id }, data: { status: "ANALISADO", summary: { ...prevSummary, contagem: counts } } });
}

export async function setRowDecision(user: CurrentUser, rowId: string, decision: "IMPORTAR" | "IGNORAR" | "VINCULAR", reason?: string) {
  assertCan(user, "importacao.executar");
  const row = await prisma.importRow.findUnique({ where: { id: rowId } });
  if (!row) throw new NotFoundError("Linha não encontrada");
  if (row.status === "INCONSISTENTE" && decision !== "IGNORAR") throw new ValidationError("Corrija o mapeamento antes de importar esta linha");
  if (decision === "IGNORAR" && !reason && !row.ignoreReason) throw new ValidationError("Informe o motivo para ignorar a linha");
  await prisma.importRow.update({ where: { id: rowId }, data: { decision, ignoreReason: decision === "IGNORAR" ? (reason || row.ignoreReason) : null } });
}

// ═════════════════════════ 4. IMPORTAR ═════════════════════════

export async function commitImport(user: CurrentUser, id: string) {
  const b = await loadBatch(user, id);
  if (b.status === "IMPORTADO") throw new ValidationError("Esta importação já foi concluída");
  if (b.status !== "ANALISADO") throw new ValidationError("Analise a planilha antes de importar");
  const vm = b.valueMap as ValueMap;
  const reasons = await prisma.rejectionReason.findMany();
  const reasonId = (code: string | null) => (code ? reasons.find((r) => r.code === code)?.id ?? null : null);
  const toImport = b.rows.filter((r) => r.decision !== "IGNORAR" && r.status !== "INCONSISTENTE" && r.status !== "IMPORTADO");

  const result = await prisma.$transaction(
    async (tx) => {
      // Cargos novos (com a grafia original guardada como apelido para as próximas importações)
      const newPositions = new Map<string, string>();
      for (const [vKey, v] of Object.entries(vm.vaga)) {
        if (v.positionId !== "NEW" || !toImport.some((r) => (r.normalized as NormalizedRow).vagaKey === vKey)) continue;
        const title = (v.newTitle || tidyName(vKey)).slice(0, 120);
        const p = (await tx.position.findUnique({ where: { title } })) ?? (await tx.position.create({ data: { title, level: "N1", defaultDepartmentName: v.departmentName || null, aliases: [vKey], description: "Criado pela importação da planilha de recrutamento — revisar nível e trilha." } }));
        newPositions.set(vKey, p.id);
      }
      // Aprende as grafias da planilha (apelidos) nos cargos existentes
      for (const [vKey, v] of Object.entries(vm.vaga)) {
        if (v.positionId === "NEW") continue;
        const p = await tx.position.findUnique({ where: { id: v.positionId } });
        if (p && normalizeText(p.title) !== vKey && !p.aliases.includes(vKey)) await tx.position.update({ where: { id: p.id }, data: { aliases: [...p.aliases, vKey] } });
      }

      const jobs = new Map<string, string>(); // unidade+cargo → vaga histórica
      const candidates = new Map<string, string>(); // nameKey → candidato
      const touchedApps = new Set<string>();
      let imported = 0;

      const ordered = [...toImport].sort((a, c) => {
        const na = a.normalized as NormalizedRow, nc = c.normalized as NormalizedRow;
        return (na.date ?? "").localeCompare(nc.date ?? "") || (na.stage ?? 1) - (nc.stage ?? 1) || a.rowNumber - c.rowNumber;
      });

      for (const row of ordered) {
        const n = row.normalized as NormalizedRow;
        const positionId = n.positionId ?? newPositions.get(n.vagaKey);
        if (!positionId || !n.departmentId || !n.date) continue;
        const when = localToDate(n.date, n.time ?? "09:00");

        // Candidato: reaproveita o mesmo da planilha (várias etapas) ou o já existente no sistema
        let candidateId = candidates.get(n.nameKey);
        if (!candidateId && row.status === "JA_EXISTE") candidateId = (await tx.candidate.findFirst({ where: { nameNormalized: normalizeText(n.name) } }))?.id;
        if (!candidateId) {
          const c = await tx.candidate.create({
            data: {
              fullName: n.name, nameNormalized: normalizeText(n.name), phone: n.phone, phoneNormalized: n.phone, email: n.email,
              desiredPositionId: positionId, source: "OUTRO", importBatchId: b.id, createdById: user.id,
              notes: `Importado da planilha “${b.fileName}” (linha ${row.rowNumber}).`,
            },
          });
          candidateId = c.id;
          await recordEvent(tx, { candidateId, type: "IMPORTACAO", summary: `Cadastro importado da planilha “${b.fileName}”`, actorUserId: user.id, actorName: n.interviewerName, occurredAt: when });
        }
        candidates.set(n.nameKey, candidateId);

        // Vaga histórica por unidade + cargo
        const jobKey = `${n.departmentId}|${positionId}`;
        let jobId = jobs.get(jobKey);
        if (!jobId) {
          const existing = await tx.jobOpening.findFirst({ where: { importBatchId: b.id, departmentId: n.departmentId, positionId } });
          jobId = existing?.id ?? (await tx.jobOpening.create({
            data: { code: await nextJobCode(tx, Number(n.date.slice(0, 4))), positionId, departmentId: n.departmentId, status: "ENCERRADA", isHistorical: true, importBatchId: b.id, openedAt: when, description: `Vaga histórica criada pela importação da planilha “${b.fileName}”.`, createdById: user.id },
          })).id;
          jobs.set(jobKey, jobId);
        }

        const app = (await tx.application.findUnique({ where: { candidateId_jobOpeningId: { candidateId, jobOpeningId: jobId } } })) ?? (await tx.application.create({ data: { candidateId, jobOpeningId: jobId } }));
        touchedApps.add(app.id);
        const eff = OUTCOME_EFFECT[n.outcome];
        const stage = n.stage ?? (await tx.interview.count({ where: { applicationId: app.id } })) + 1;
        const rid = eff.rh === "REPROVADO" ? reasonId(n.reasonCode && n.reasonCode !== "" ? n.reasonCode : "NAO_INFORMADO") ?? reasonId("NAO_INFORMADO") : eff.rh === "DESISTIU" ? reasonId(n.reasonCode) : null;
        const iv = await tx.interview.create({
          data: {
            applicationId: app.id, type: stage > 1 ? "GESTOR" : "TRIAGEM_RH", stage, scheduledAt: when, hasTime: !!n.time,
            interviewerUserId: n.interviewerUserId, interviewerName: n.interviewerName,
            status: eff.rh === "NAO_COMPARECEU" ? "NAO_COMPARECEU" : "REALIZADA",
            result: eff.rh, reasonId: rid, resultNote: n.note, resultAt: when, resultById: user.id, createdById: user.id,
          },
        });
        const appPatch: Prisma.ApplicationUpdateInput = { status: eff.app, externalCheckStatus: eff.external };
        if (n.lastSalary) appPatch.lastSalary = n.lastSalary;
        if (n.expectedSalary) appPatch.expectedSalary = n.expectedSalary;
        await tx.application.update({ where: { id: app.id }, data: appPatch });
        if (eff.manager) {
          await tx.managerReview.create({
            data: {
              applicationId: app.id, status: eff.manager, requestedById: user.id, requestedAt: when,
              justification: eff.manager === "REPROVADO" ? `Registro histórico da planilha: “${n.resultText}${n.motivoText ? ` — ${n.motivoText}` : ""}”` : null,
              reasonId: eff.manager === "REPROVADO" ? reasonId(n.reasonCode) : null,
              onBehalf: eff.manager !== "PENDENTE", decidedById: eff.manager !== "PENDENTE" ? user.id : null, decidedAt: eff.manager !== "PENDENTE" ? when : null,
            },
          });
        }
        await recordEvent(tx, {
          candidateId, applicationId: app.id, interviewId: iv.id, type: "IMPORTACAO", occurredAt: when,
          summary: `${stage}ª entrevista (${n.positionTitle}, ${n.unitName}) com ${n.interviewerName ?? "—"}: ${OUTCOME_LABEL[n.outcome]}`,
          details: { linha: row.rowNumber, planilha: b.fileName, resultadoOriginal: n.resultText, motivoOriginal: n.motivoText },
          actorUserId: user.id, actorName: n.interviewerName,
        });
        await tx.importRow.update({ where: { id: row.id }, data: { status: "IMPORTADO", candidateId } });
        imported++;
      }
      const ignored = b.rows.length - imported;
      await tx.importRow.updateMany({ where: { batchId: b.id, status: { not: "IMPORTADO" } }, data: { decision: "IGNORAR" } });
      await tx.importBatch.update({ where: { id: b.id }, data: { status: "IMPORTADO", committedAt: new Date(), importedRows: imported, ignoredRows: ignored } });
      return { imported, ignored, candidates: candidates.size, jobs: jobs.size, applications: touchedApps.size };
    },
    { timeout: 120_000, maxWait: 20_000 }
  );
  await recordAudit({ entityType: "ImportBatch", entityId: b.id, action: "CREATE", actorId: user.id, actorRole: user.role, newValue: result, justification: `Importação da planilha “${b.fileName}”` });
  return result;
}

export async function cancelImport(user: CurrentUser, id: string) {
  const b = await loadBatch(user, id);
  if (b.status === "IMPORTADO") throw new ValidationError("Importação concluída não pode ser cancelada");
  await prisma.importBatch.update({ where: { id }, data: { status: "CANCELADO" } });
}

export async function getBatch(user: CurrentUser, id: string) {
  return loadBatch(user, id);
}

export async function listBatches(user: CurrentUser) {
  assertCan(user, "importacao.executar");
  return prisma.importBatch.findMany({ orderBy: { createdAt: "desc" }, take: 20, include: { createdBy: { select: { name: true } } } });
}

/** Relatório CSV com todas as linhas e o que aconteceu com cada uma (nada some sem motivo). */
export async function batchReportCsv(user: CurrentUser, id: string): Promise<string> {
  const b = await loadBatch(user, id);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [["Linha", "Situação", "Decisão", "Motivo (se ignorada)", "Candidato", "Data", "Unidade", "Cargo", "Desfecho interpretado", "Observações"].map(esc).join(";")];
  for (const r of b.rows) {
    const n = (r.normalized ?? {}) as Partial<NormalizedRow>;
    lines.push([r.rowNumber, r.status, r.decision, r.ignoreReason, n.name, n.date, n.unitName, n.positionTitle, n.outcomeLabel, r.issues.join(" | ")].map(esc).join(";"));
  }
  return "﻿" + lines.join("\r\n");
}
