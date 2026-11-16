/**
 * Indicadores de RH — funções puras sobre a base normalizada (ver dataset.ts).
 * Toda taxa informa numerador, denominador (n) e o que foi excluído. Nada é estimado:
 * quando não há observação, o valor é null (exibido como "—"), nunca zero.
 */
import type { ApplicationStatus, InterviewResult, InterviewStatus, JobOpeningStatus, ManagerDecision, SlaStage } from "@prisma/client";
import { inPeriod, bucketOf, type Granularity, type Period } from "@/modules/analytics/periods";

// ═════════════════════════ Base normalizada ═════════════════════════

export type Dims = {
  unitId: string; unitName: string;
  departmentId: string; departmentName: string;
  positionId: string; positionTitle: string;
  managerId: string | null; managerName: string | null;
  historical: boolean;
};

export type IvRec = Dims & {
  id: string; applicationId: string; jobId: string; candidateId: string; candidateName: string;
  scheduledAt: Date; status: InterviewStatus; result: InterviewResult; resultAt: Date | null; stage: number;
  reason: string | null; recruiter: string;
};

export type ReviewRec = Dims & {
  id: string; applicationId: string; candidateName: string; status: ManagerDecision; requestedAt: Date; decidedAt: Date | null; onBehalf: boolean; reviewManagerId: string | null; reviewManagerName: string | null;
};

export type AppRec = Dims & {
  id: string; jobId: string; jobCode: string; jobOpenedAt: Date | null; candidateId: string; candidateName: string;
  status: ApplicationStatus; approvedAt: Date | null; hiredAt: Date | null;
  interviews: IvRec[]; reviews: ReviewRec[];
};

export type JobRec = Dims & { id: string; code: string; status: JobOpeningStatus; openedAt: Date | null; closedAt: Date | null; headcount: number; firstInterviewAt: Date | null };

export type CandRec = { id: string; entryAt: Date; jobIds: string[] };

export type Dataset = { jobs: JobRec[]; apps: AppRec[]; interviews: IvRec[]; reviews: ReviewRec[]; candidates: CandRec[] };

export type Filters = { unitId?: string; departmentName?: string; positionId?: string; recruiter?: string; managerId?: string };

// ═════════════════════════ Filtros ═════════════════════════

export function matchDims(d: Dims, f: Filters) {
  return (!f.unitId || d.unitId === f.unitId)
    && (!f.departmentName || d.departmentName === f.departmentName)
    && (!f.positionId || d.positionId === f.positionId)
    && (!f.managerId || d.managerId === f.managerId);
}

export function filterDataset(ds: Dataset, f: Filters): Dataset {
  const jobs = ds.jobs.filter((j) => matchDims(j, f));
  const interviews = ds.interviews.filter((i) => matchDims(i, f) && (!f.recruiter || i.recruiter === f.recruiter));
  const apps = ds.apps.filter((a) => matchDims(a, f) && (!f.recruiter || a.interviews.some((i) => i.recruiter === f.recruiter)));
  const appIds = new Set(apps.map((a) => a.id));
  const reviews = ds.reviews.filter((r) => matchDims(r, f) && (!f.recruiter || appIds.has(r.applicationId)));
  const jobIds = new Set(jobs.map((j) => j.id));
  const anyDim = !!(f.unitId || f.departmentName || f.positionId || f.managerId || f.recruiter);
  const candIds = new Set(apps.map((a) => a.candidateId));
  const candidates = ds.candidates.filter((c) => (anyDim ? candIds.has(c.id) && c.jobIds.some((j) => jobIds.has(j)) : true));
  return { jobs, apps, interviews, reviews, candidates };
}

// ═════════════════════════ Estatística ═════════════════════════

export type Rate = { value: number | null; num: number; den: number; excluded?: Record<string, number>; rule: string };
export const rate = (num: number, den: number, rule: string, excluded?: Record<string, number>): Rate => ({ value: den ? num / den : null, num, den, excluded, rule });

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
export const days = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 86_400_000;

/** Decisão do RH na candidatura: primeiro resultado conclusivo (aprovado/reprovado/desistiu/faltou) em ordem de data. */
export function rhDecision(a: AppRec): IvRec | null {
  return [...a.interviews].sort((x, y) => x.scheduledAt.getTime() - y.scheduledAt.getTime()).find((i) => ["APROVADO", "REPROVADO", "DESISTIU", "NAO_COMPARECEU"].includes(i.result)) ?? null;
}
export function firstInterview(a: AppRec): IvRec | null {
  return [...a.interviews].sort((x, y) => x.scheduledAt.getTime() - y.scheduledAt.getTime())[0] ?? null;
}
const attended = (a: AppRec) => a.interviews.some((i) => i.result === "APROVADO" || i.result === "REPROVADO");

// ═════════════════════════ 1. Recrutamento (contagens do período) ═════════════════════════

export function recruitmentCounts(ds: Dataset, p: Period) {
  const real = ds.jobs.filter((j) => !j.historical);
  const ivs = ds.interviews.filter((i) => inPeriod(i.scheduledAt, p) && i.status !== "CANCELADA");
  const decided = ds.reviews.filter((r) => inPeriod(r.decidedAt, p));
  return {
    vagasAbertasAgora: real.filter((j) => j.status === "ABERTA").length,
    vagasAbertasNoPeriodo: real.filter((j) => inPeriod(j.openedAt, p)).length,
    vagasEncerradas: real.filter((j) => inPeriod(j.closedAt, p) && ["PREENCHIDA", "CANCELADA", "ENCERRADA"].includes(j.status)).length,
    candidatosCadastrados: ds.candidates.filter((c) => inPeriod(c.entryAt, p)).length,
    entrevistasAgendadas: ivs.length,
    entrevistasRealizadas: ivs.filter((i) => i.status === "REALIZADA").length,
    faltas: ivs.filter((i) => i.result === "NAO_COMPARECEU").length,
    desistencias: ivs.filter((i) => i.result === "DESISTIU").length,
    aprovacoesRH: ivs.filter((i) => i.result === "APROVADO").length,
    reprovacoesRH: ivs.filter((i) => i.result === "REPROVADO").length,
    semResultado: ivs.filter((i) => i.result === "PENDENTE" && i.scheduledAt < new Date()).length,
    aprovacoesGestor: decided.filter((r) => r.status === "APROVADO").length,
    reprovacoesGestor: decided.filter((r) => r.status === "REPROVADO").length,
    novaEntrevistaGestor: decided.filter((r) => r.status === "NOVA_ENTREVISTA").length,
    pendentesGestorAgora: ds.reviews.filter((r) => r.status === "PENDENTE").length,
    contratacoes: ds.apps.filter((a) => inPeriod(a.hiredAt, p)).length,
  };
}

// ═════════════════════════ 2. Conversão ═════════════════════════

/**
 * Coorte: candidaturas cuja PRIMEIRA entrevista caiu no período (cada candidatura conta uma vez).
 * Comparecimento é por entrevista (cada convocação conta).
 */
export function conversion(ds: Dataset, p: Period) {
  const ivs = ds.interviews.filter((i) => inPeriod(i.scheduledAt, p) && i.status !== "CANCELADA");
  const present = ivs.filter((i) => i.result === "APROVADO" || i.result === "REPROVADO").length;
  const absent = ivs.filter((i) => i.result === "NAO_COMPARECEU").length;

  const cohort = ds.apps.filter((a) => inPeriod(firstInterview(a)?.scheduledAt, p));
  const dec = cohort.map(rhDecision);
  const rhA = dec.filter((d) => d?.result === "APROVADO").length;
  const rhR = dec.filter((d) => d?.result === "REPROVADO").length;
  const attendedApps = cohort.filter(attended);
  const hired = cohort.filter((a) => a.status === "CONTRATADO").length;
  const stillOpen = attendedApps.filter((a) => ["ENTREVISTA", "AVALIACAO", "AGUARDANDO_GESTOR", "PROPOSTA", "APROVADO"].includes(a.status)).length;
  const desist = cohort.filter((a) => a.status === "DESISTENTE" || a.interviews.some((i) => i.result === "DESISTIU")).length;
  const desistBase = cohort.filter((a) => attended(a) || a.interviews.some((i) => i.result === "DESISTIU")).length;

  const decided = ds.reviews.filter((r) => inPeriod(r.decidedAt, p));
  const gA = decided.filter((r) => r.status === "APROVADO").length;
  const gR = decided.filter((r) => r.status === "REPROVADO").length;

  return {
    comparecimento: rate(present, present + absent, "Compareceu (aprovado ou reprovado pelo RH) ÷ (compareceu + faltou), por entrevista realizada no período", {
      "desistências (presença incerta)": ivs.filter((i) => i.result === "DESISTIU").length,
      "sem resultado registrado": ivs.filter((i) => i.result === "PENDENTE").length,
    }),
    aprovacaoRH: rate(rhA, rhA + rhR, "Aprovadas ÷ (aprovadas + reprovadas) pelo RH, por candidatura com 1ª entrevista no período", {
      "faltas/desistências": dec.filter((d) => d && (d.result === "NAO_COMPARECEU" || d.result === "DESISTIU")).length,
      "sem decisão do RH": dec.filter((d) => !d).length,
    }),
    aprovacaoGestor: rate(gA, gA + gR, "Aprovações ÷ (aprovações + reprovações) dos gestores decididas no período", {
      "pedidos de nova entrevista": decided.filter((r) => r.status === "NOVA_ENTREVISTA").length,
      "pendentes hoje": ds.reviews.filter((r) => r.status === "PENDENTE").length,
    }),
    contratacao: rate(hired, attendedApps.length, "Contratadas ÷ candidaturas que compareceram à entrevista (coorte da 1ª entrevista no período)", {
      "ainda em processo (coorte não concluída)": stillOpen,
    }),
    desistencia: rate(desist, desistBase, "Desistências ÷ (candidaturas que compareceram + desistências), coorte da 1ª entrevista no período", {
      "faltas": cohort.filter((a) => !attended(a) && a.interviews.some((i) => i.result === "NAO_COMPARECEU")).length,
    }),
    cohortSize: cohort.length,
  };
}

// ═════════════════════════ 3. Produtividade ═════════════════════════

export type GroupRow = { key: string; label: string; agendadas: number; realizadas: number; faltas: number; aprovadasRH: number };

export function interviewsBy(ds: Dataset, p: Period, dim: "recruiter" | "departmentName" | "unitName" | "positionTitle"): GroupRow[] {
  const map = new Map<string, GroupRow>();
  for (const i of ds.interviews) {
    if (!inPeriod(i.scheduledAt, p) || i.status === "CANCELADA") continue;
    const key = dim === "recruiter" ? i.recruiter : (i[dim] as string);
    const r = map.get(key) ?? { key, label: key, agendadas: 0, realizadas: 0, faltas: 0, aprovadasRH: 0 };
    r.agendadas++;
    if (i.status === "REALIZADA") r.realizadas++;
    if (i.result === "NAO_COMPARECEU") r.faltas++;
    if (i.result === "APROVADO") r.aprovadasRH++;
    map.set(key, r);
  }
  return [...map.values()].sort((a, b) => b.agendadas - a.agendadas || a.label.localeCompare(b.label));
}

/** Contratação atribuída à recrutadora da entrevista em que o RH aprovou. */
export function hiresByRecruiter(ds: Dataset, p: Period) {
  const map = new Map<string, number>();
  for (const a of ds.apps) {
    if (!inPeriod(a.hiredAt, p)) continue;
    const who = a.interviews.find((i) => i.result === "APROVADO")?.recruiter ?? "Não identificada";
    map.set(who, (map.get(who) ?? 0) + 1);
  }
  return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

/** Tempo dos gestores: pedido do RH → decisão (dias corridos), por gestor. Só registros do sistema (não importados). */
export function managerEvaluationTime(ds: Dataset, p: Period) {
  const map = new Map<string, { label: string; values: number[]; pending: number; oldestPendingDays: number | null; onBehalf: number }>();
  const now = new Date();
  for (const r of ds.reviews) {
    if (r.historical) continue;
    const key = r.reviewManagerName ?? "Sem gestor definido";
    const g = map.get(key) ?? { label: key, values: [], pending: 0, oldestPendingDays: null, onBehalf: 0 };
    if (r.decidedAt && inPeriod(r.decidedAt, p) && r.status !== "PENDENTE") {
      g.values.push(days(r.requestedAt, r.decidedAt));
      if (r.onBehalf) g.onBehalf++;
    }
    if (r.status === "PENDENTE") {
      g.pending++;
      const age = days(r.requestedAt, now);
      g.oldestPendingDays = Math.max(g.oldestPendingDays ?? 0, age);
    }
    map.set(key, g);
  }
  return [...map.values()]
    .filter((g) => g.values.length || g.pending)
    .map((g) => ({ label: g.label, n: g.values.length, mean: mean(g.values), median: median(g.values), pending: g.pending, oldestPendingDays: g.oldestPendingDays, onBehalf: g.onBehalf }))
    .sort((a, b) => (b.mean ?? -1) - (a.mean ?? -1));
}

// ═════════════════════════ 4. SLA ═════════════════════════

export const SLA_STAGES: Array<{ stage: SlaStage; label: string; owner: "RH" | "Gestor" | "Admissão" | "Ponta a ponta"; from: string; to: string }> = [
  { stage: "ABERTURA_PRIMEIRA_ENTREVISTA", label: "Abertura → 1ª entrevista", owner: "RH", from: "abertura da vaga", to: "1ª entrevista agendada" },
  { stage: "ENTREVISTA_APROVACAO_RH", label: "1ª entrevista → aprovação do RH", owner: "RH", from: "1ª entrevista da candidatura", to: "registro da aprovação pelo RH" },
  { stage: "APROVACAO_RH_GESTOR", label: "Aprovação do RH → avaliação do gestor", owner: "Gestor", from: "encaminhamento ao gestor", to: "decisão do gestor" },
  { stage: "APROVACAO_ADMISSAO", label: "Aprovação final → admissão", owner: "Admissão", from: "aprovação final", to: "data de admissão" },
  { stage: "ABERTURA_CONTRATACAO", label: "Abertura → contratação", owner: "Ponta a ponta", from: "abertura da vaga", to: "data de admissão" },
];

export type TargetResolver = (stage: SlaStage, positionId: string, departmentName: string) => number | null;
export type SlaItem = { stage: SlaStage; label: string; ref: string; dims: Dims; days: number; target: number | null; end: Date };

/** Medições individuais de cada etapa (somente registros do sistema; histórico importado fica de fora). */
export function slaItems(ds: Dataset): SlaItem[] {
  const out: SlaItem[] = [];
  for (const j of ds.jobs) {
    if (j.historical || !j.openedAt || !j.firstInterviewAt) continue;
    out.push({ stage: "ABERTURA_PRIMEIRA_ENTREVISTA", label: j.code, ref: j.id, dims: j, days: Math.max(0, days(j.openedAt, j.firstInterviewAt)), target: null, end: j.firstInterviewAt });
  }
  for (const a of ds.apps) {
    if (a.historical) continue;
    const first = firstInterview(a);
    const appr = [...a.interviews].sort((x, y) => x.scheduledAt.getTime() - y.scheduledAt.getTime()).find((i) => i.result === "APROVADO");
    if (first && appr?.resultAt) out.push({ stage: "ENTREVISTA_APROVACAO_RH", label: `${a.candidateName} (${a.jobCode})`, ref: a.id, dims: a, days: Math.max(0, days(first.scheduledAt, appr.resultAt)), target: null, end: appr.resultAt });
    if (a.approvedAt && a.hiredAt) out.push({ stage: "APROVACAO_ADMISSAO", label: `${a.candidateName} (${a.jobCode})`, ref: a.id, dims: a, days: Math.max(0, days(a.approvedAt, a.hiredAt)), target: null, end: a.hiredAt });
    if (a.jobOpenedAt && a.hiredAt) out.push({ stage: "ABERTURA_CONTRATACAO", label: `${a.candidateName} (${a.jobCode})`, ref: a.id, dims: a, days: Math.max(0, days(a.jobOpenedAt, a.hiredAt)), target: null, end: a.hiredAt });
  }
  for (const r of ds.reviews) {
    if (r.historical || !r.decidedAt || r.status === "PENDENTE") continue;
    out.push({ stage: "APROVACAO_RH_GESTOR", label: `${r.candidateName} — ${r.reviewManagerName ?? "sem gestor"}`, ref: r.id, dims: r, days: Math.max(0, days(r.requestedAt, r.decidedAt)), target: null, end: r.decidedAt });
  }
  return out;
}

export function slaSummary(ds: Dataset, p: Period, resolve: TargetResolver) {
  const items = slaItems(ds).filter((i) => inPeriod(i.end, p)).map((i) => ({ ...i, target: resolve(i.stage, i.dims.positionId, i.dims.departmentName) }));
  // Itens em aberto agora (etapa iniciada e não concluída) — mostra o atraso que ainda não virou estatística
  const now = new Date();
  const open: Record<SlaStage, Array<{ label: string; days: number; target: number | null }>> = { ABERTURA_PRIMEIRA_ENTREVISTA: [], ENTREVISTA_APROVACAO_RH: [], APROVACAO_RH_GESTOR: [], APROVACAO_ADMISSAO: [], ABERTURA_CONTRATACAO: [] };
  for (const j of ds.jobs) if (!j.historical && j.status === "ABERTA" && j.openedAt && !j.firstInterviewAt) open.ABERTURA_PRIMEIRA_ENTREVISTA.push({ label: `${j.code} — ${j.positionTitle}`, days: days(j.openedAt, now), target: resolve("ABERTURA_PRIMEIRA_ENTREVISTA", j.positionId, j.departmentName) });
  for (const r of ds.reviews) if (!r.historical && r.status === "PENDENTE") open.APROVACAO_RH_GESTOR.push({ label: `${r.candidateName} — ${r.reviewManagerName ?? "sem gestor"}`, days: days(r.requestedAt, now), target: resolve("APROVACAO_RH_GESTOR", r.positionId, r.departmentName) });
  for (const a of ds.apps) if (!a.historical && a.status === "APROVADO" && a.approvedAt) open.APROVACAO_ADMISSAO.push({ label: `${a.candidateName} (${a.jobCode})`, days: days(a.approvedAt, now), target: resolve("APROVACAO_ADMISSAO", a.positionId, a.departmentName) });

  return SLA_STAGES.map((s) => {
    const list = items.filter((i) => i.stage === s.stage);
    const vals = list.map((i) => i.days);
    const withTarget = list.filter((i) => i.target !== null);
    const within = withTarget.filter((i) => i.days <= (i.target as number)).length;
    return {
      ...s,
      n: list.length,
      mean: mean(vals),
      median: median(vals),
      max: vals.length ? Math.max(...vals) : null,
      withinTarget: rate(within, withTarget.length, "Medições dentro da meta ÷ medições com meta definida"),
      targets: [...new Set(withTarget.map((i) => i.target))],
      worst: [...list].sort((a, b) => b.days - a.days).slice(0, 5),
      openNow: open[s.stage].sort((a, b) => b.days - a.days),
      openLate: open[s.stage].filter((o) => o.target !== null && o.days > (o.target as number)).length,
    };
  });
}

// ═════════════════════════ 5. Tendência ═════════════════════════

export function trend(ds: Dataset, periods: Period[], gran: Granularity) {
  return periods.map((p) => {
    const ivs = ds.interviews.filter((i) => i.status !== "CANCELADA" && bucketOf(i.scheduledAt, gran) === p.from);
    return {
      key: p.from,
      label: p.label,
      agendadas: ivs.length,
      realizadas: ivs.filter((i) => i.status === "REALIZADA").length,
      aprovadasRH: ivs.filter((i) => i.result === "APROVADO").length,
      contratacoes: ds.apps.filter((a) => a.hiredAt && bucketOf(a.hiredAt, gran) === p.from).length,
    };
  });
}

export function reasonsBreakdown(ds: Dataset, p: Period) {
  const map = new Map<string, number>();
  for (const i of ds.interviews) if (inPeriod(i.scheduledAt, p) && i.result === "REPROVADO") map.set(i.reason ?? "Sem motivo", (map.get(i.reason ?? "Sem motivo") ?? 0) + 1);
  return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}
