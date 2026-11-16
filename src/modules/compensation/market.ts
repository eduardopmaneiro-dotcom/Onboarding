/**
 * Pesquisa salarial: dados das entrevistas (pretensão, oferta, último salário, benefícios valorizados,
 * motivos de recusa) + salários praticados internamente + registros de mercado (concorrentes).
 * Salário-base e remuneração total são sempre tratados em colunas separadas.
 */
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { assertCan, type CurrentUser } from "@/lib/session";
import { dateKey, localToDate, todayKey } from "@/lib/datetime";
import { parseMoney } from "@/lib/text";
import { NotFoundError, ValidationError } from "@/modules/shared/errors";
import { jobScopeWhere } from "@/modules/recruitment/scope";
import { employeeScopeWhere } from "@/modules/people/scope";
import { makePeriod, type Granularity } from "@/modules/analytics/periods";
import { mean, median } from "@/modules/analytics/metrics";
import { resolveBase, resolvePositionSalary } from "@/modules/compensation/calc";
import { CANCEL_REASON_LABEL } from "@/modules/admission/constants";

export type Stats = { n: number; mean: number | null; median: number | null; min: number | null; max: number | null };
export function stats(xs: number[]): Stats {
  return { n: xs.length, mean: xs.length ? Math.round(mean(xs)! * 100) / 100 : null, median: median(xs), min: xs.length ? Math.min(...xs) : null, max: xs.length ? Math.max(...xs) : null };
}

/** Diferença pretensão − oferta, só em candidaturas com os dois valores. */
export function gapStats(pairs: Array<{ expected: number; offered: number }>) {
  const diffs = pairs.map((p) => p.expected - p.offered);
  const pcts = pairs.map((p) => ((p.expected - p.offered) / p.offered) * 100);
  return {
    n: pairs.length,
    meanDiff: diffs.length ? Math.round(mean(diffs)! * 100) / 100 : null,
    medianDiff: median(diffs),
    meanPct: pcts.length ? Math.round(mean(pcts)! * 10) / 10 : null,
    aboveOffer: pairs.filter((p) => p.expected > p.offered).length,
  };
}

const daysBetween = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 86_400_000;

export type SurveyQuery = { gran?: string; ref?: string; unidade?: string; cargo?: string };

export async function buildSurvey(user: CurrentUser, q: SurveyQuery) {
  assertCan(user, "pesquisa_salarial.view");
  const gran: Granularity = (["semana", "mes", "trimestre", "ano"] as const).includes(q.gran as Granularity) ? (q.gran as Granularity) : "ano";
  const period = makePeriod(gran, q.ref && /^\d{4}-\d{2}-\d{2}$/.test(q.ref) ? q.ref : todayKey());
  const inP = (d: Date | null | undefined) => !!d && d >= period.fromDate && d < period.toDate;
  const today = todayKey();

  const jobs = await prisma.jobOpening.findMany({
    where: { ...jobScopeWhere(user), ...(q.unidade ? { department: { unitId: q.unidade } } : {}), ...(q.cargo ? { positionId: q.cargo } : {}) },
    include: {
      position: { select: { id: true, title: true } }, department: { select: { unitId: true } },
      applications: { include: { interviews: { include: { reason: { select: { label: true } } } }, managerReviews: { include: { reason: { select: { label: true } } } }, admissions: { select: { status: true, cancelReason: true, canceledAt: true } } } },
    },
  });
  type Pos = { id: string; title: string; expected: number[]; offered: number[]; last: number[]; pairs: Array<{ expected: number; offered: number }>; openAges: number[]; fillDays: number[]; openNow: number; hires: number; interviewed: number; withdrew: number };
  const pos = new Map<string, Pos>();
  const P = (id: string, title: string) => pos.get(id) ?? (pos.set(id, { id, title, expected: [], offered: [], last: [], pairs: [], openAges: [], fillDays: [], openNow: 0, hires: 0, interviewed: 0, withdrew: 0 }), pos.get(id)!);
  const declines = new Map<string, number>(), rejections = new Map<string, number>(), benefits = new Map<string, number>();
  let appsInPeriod = 0, appsWithBenefits = 0;
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

  for (const j of jobs) {
    const p = P(j.position.id, j.position.title);
    if (["ABERTA", "PAUSADA"].includes(j.status) && j.openedAt) { p.openNow++; p.openAges.push(daysBetween(j.openedAt, new Date())); }
    for (const a of j.applications) {
      const ivs = a.interviews.filter((i) => i.status !== "CANCELADA");
      const first = ivs.map((i) => i.scheduledAt).sort((x, y) => +x - +y)[0];
      const ref = first ?? a.createdAt;
      if (a.hiredAt && inP(a.hiredAt)) { p.hires++; if (j.openedAt && !j.isHistorical) p.fillDays.push(daysBetween(j.openedAt, a.hiredAt)); }
      if (!inP(ref)) continue;
      appsInPeriod++;
      const e = a.expectedSalary ? Number(a.expectedSalary) : null, o = a.offeredSalary ? Number(a.offeredSalary) : null, l = a.lastSalary ? Number(a.lastSalary) : null;
      if (e) p.expected.push(e);
      if (o) p.offered.push(o);
      if (l) p.last.push(l);
      if (e && o) p.pairs.push({ expected: e, offered: o });
      if (a.valuedBenefits.length) { appsWithBenefits++; for (const b of a.valuedBenefits) bump(benefits, b); }
      if (ivs.length) p.interviewed++;
      const withdrew = ivs.filter((i) => i.result === "DESISTIU");
      if (withdrew.length || a.admissions.some((x) => x.cancelReason === "DESISTENCIA_CANDIDATO")) p.withdrew++;
      for (const i of withdrew) bump(declines, i.reason?.label ?? "Motivo não informado");
      for (const x of a.admissions) if (x.status === "CANCELADA" && x.cancelReason) bump(declines, `Na admissão: ${CANCEL_REASON_LABEL[x.cancelReason]}`);
      for (const i of ivs.filter((i) => i.result === "REPROVADO")) bump(rejections, `RH: ${i.reason?.label ?? "Motivo não informado"}`);
      for (const r of a.managerReviews.filter((r) => r.status === "REPROVADO")) bump(rejections, `Gestor: ${r.reason?.label ?? "Motivo não informado"}`);
    }
  }

  // salário praticado (base vigente hoje de quem está ativo) e tabela do cargo
  const emps = await prisma.employee.findMany({
    where: { ...employeeScopeWhere(user), status: { not: "DESLIGADO" }, ...(q.unidade ? { department: { unitId: q.unidade } } : {}), ...(q.cargo ? { positionId: q.cargo } : {}) },
    include: { salaries: true, position: { select: { id: true, title: true } }, department: { select: { unitId: true } } },
  });
  const practiced = new Map<string, number[]>();
  for (const e of emps) {
    const b = resolveBase(e.baseSalary ? Number(e.baseSalary) : null, e.salaries.map((s) => ({ amount: Number(s.amount), effectiveFrom: dateKey(s.effectiveFrom) })), today);
    P(e.position.id, e.position.title);
    if (b !== null) practiced.set(e.positionId, [...(practiced.get(e.positionId) ?? []), b]);
  }
  const table = await prisma.positionSalary.findMany();
  const market = await prisma.marketSalary.findMany({ where: q.cargo ? { positionId: q.cargo } : {}, include: { position: { select: { title: true } } }, orderBy: { collectedAt: "desc" } });
  for (const m of market) P(m.positionId, m.position.title);

  const rows = [...pos.values()].map((p) => {
    const mk = market.filter((m) => m.positionId === p.id);
    const ref = resolvePositionSalary(table.filter((t) => t.positionId === p.id && (!q.unidade || !t.unitId || t.unitId === q.unidade)).map((t) => ({ unitId: t.unitId, baseSalary: Number(t.baseSalary), effectiveFrom: dateKey(t.effectiveFrom) })), q.unidade ?? "__geral__", today);
    const fill = median(p.fillDays);
    const oldestOpen = p.openAges.length ? Math.max(...p.openAges) : null;
    return {
      positionId: p.id, title: p.title,
      expected: stats(p.expected), offered: stats(p.offered), last: stats(p.last), gap: gapStats(p.pairs),
      practiced: stats(practiced.get(p.id) ?? []), table: ref?.value ?? null,
      marketBase: stats(mk.map((m) => m.baseSalary).filter((v) => v !== null).map(Number)), marketTotal: stats(mk.map((m) => m.totalComp).filter((v) => v !== null).map(Number)),
      difficulty: {
        openNow: p.openNow, oldestOpenDays: oldestOpen === null ? null : Math.round(oldestOpen), medianFillDays: fill === null ? null : Math.round(fill * 10) / 10,
        hires: p.hires, interviewed: p.interviewed, interviewedPerHire: p.hires ? Math.round((p.interviewed / p.hires) * 10) / 10 : null,
        withdrawalRate: p.interviewed ? p.withdrew / p.interviewed : null, aboveOfferRate: p.pairs.length ? p.pairs.filter((x) => x.expected > x.offered).length / p.pairs.length : null,
        signal: Math.max(fill ?? 0, oldestOpen ?? 0),
      },
    };
  });
  const all = (k: "expected" | "offered" | "last") => stats([...pos.values()].flatMap((p) => p[k]));
  const sortCount = (m: Map<string, number>) => [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  return {
    period, filters: q, appsInPeriod, appsWithBenefits,
    overall: { expected: all("expected"), offered: all("offered"), last: all("last"), gap: gapStats([...pos.values()].flatMap((p) => p.pairs)) },
    rows: rows.sort((a, b) => a.title.localeCompare(b.title)),
    difficulty: rows.filter((r) => r.difficulty.openNow || r.difficulty.hires || r.difficulty.interviewed).sort((a, b) => b.difficulty.signal - a.difficulty.signal || (b.difficulty.withdrawalRate ?? 0) - (a.difficulty.withdrawalRate ?? 0)),
    declines: sortCount(declines), rejections: sortCount(rejections), benefits: sortCount(benefits),
    market,
    options: {
      units: await prisma.unit.findMany({ where: { active: true, ...(user.role === "RH" && user.unitId ? { id: user.unitId } : {}) }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      positions: [...pos.values()].map((p) => ({ value: p.id, label: p.title })).sort((a, b) => a.label.localeCompare(b.label)),
    },
  };
}
export type Survey = Awaited<ReturnType<typeof buildSurvey>>;

const marketInput = z.object({
  positionId: z.string({ error: "Escolha o cargo" }).min(1, "Escolha o cargo"),
  companyName: z.string({ error: "Informe o hotel/empresa" }).trim().min(2, "Informe o hotel/empresa").max(100),
  hotelCategory: z.string().trim().max(40).optional(),
  region: z.string().trim().max(60).optional(),
  source: z.enum(["CONCORRENTE", "ANUNCIO_VAGA", "PESQUISA_SETORIAL", "SINDICATO", "CANDIDATO", "OUTRO"]),
  baseSalary: z.preprocess((v) => (v === undefined || v === "" ? null : parseMoney(v)), z.number().positive("Valor inválido").nullable()),
  totalComp: z.preprocess((v) => (v === undefined || v === "" ? null : parseMoney(v)), z.number().positive("Valor inválido").nullable()),
  benefits: z.string().optional(),
  collectedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  reference: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(500).optional(),
});

export async function saveMarketSalary(user: CurrentUser, raw: unknown) {
  assertCan(user, "pesquisa_salarial.manage");
  const d = marketInput.parse(raw);
  if (d.baseSalary === null && d.totalComp === null) throw new ValidationError("Informe o salário-base e/ou a remuneração total", { baseSalary: ["Informe ao menos um valor"] });
  if (d.baseSalary !== null && d.totalComp !== null && d.totalComp < d.baseSalary) throw new ValidationError("Remuneração total menor que o salário-base — confira os campos", { totalComp: ["Menor que o salário-base"] });
  if (d.collectedAt > todayKey()) throw new ValidationError("Data de coleta futura", { collectedAt: ["Data futura"] });
  if (!d.reference && d.source !== "CANDIDATO") throw new ValidationError("Informe a fonte/referência (link, documento, contato)", { reference: ["Obrigatório"] });
  const row = await prisma.marketSalary.create({
    data: { positionId: d.positionId, companyName: d.companyName, hotelCategory: d.hotelCategory ?? null, region: d.region ?? null, source: d.source, baseSalary: d.baseSalary, totalComp: d.totalComp, benefits: (d.benefits ?? "").split(",").map((s) => s.trim()).filter(Boolean), collectedAt: localToDate(d.collectedAt), reference: d.reference ?? null, notes: d.notes ?? null, createdById: user.id },
  });
  await recordAudit({ entityType: "MarketSalary", entityId: row.id, action: "CREATE", actorId: user.id, actorRole: user.role, newValue: d });
  return row;
}

export async function deleteMarketSalary(user: CurrentUser, id: string) {
  assertCan(user, "pesquisa_salarial.manage");
  const row = await prisma.marketSalary.findUnique({ where: { id } });
  if (!row) throw new NotFoundError("Registro não encontrado");
  await prisma.marketSalary.delete({ where: { id } });
  await recordAudit({ entityType: "MarketSalary", entityId: id, action: "DELETE", actorId: user.id, actorRole: user.role, previousValue: { companyName: row.companyName, positionId: row.positionId } });
}
