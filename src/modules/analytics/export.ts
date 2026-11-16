import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { fmtDateTime, timeKey, dateKey } from "@/lib/datetime";
import { filterSummary, type Report } from "@/modules/analytics/report";
import type { Rate } from "@/modules/analytics/metrics";

const BROWN = "FF5C3D1E", GOLD = "FF8B6340", BEIGE = "FFF5EFE6";
const pctTxt = (r: Rate) => (r.value === null ? "—" : `${(r.value * 100).toFixed(1).replace(".", ",")}%`);
const d1 = (v: number | null | undefined) => (v === null || v === undefined ? null : Math.round(v * 10) / 10);

// ═════════════════════════ Excel ═════════════════════════

function header(ws: ExcelJS.Worksheet, title: string, sub: string) {
  ws.addRow([title]).font = { bold: true, size: 14, color: { argb: BROWN } };
  ws.addRow([sub]).font = { italic: true, size: 10, color: { argb: GOLD } };
  ws.addRow([]);
}
function tableHead(ws: ExcelJS.Worksheet, cols: string[]) {
  const r = ws.addRow(cols);
  r.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BROWN } };
    c.alignment = { vertical: "middle", wrapText: true };
  });
  return r;
}
function totalStyle(row: ExcelJS.Row) {
  row.eachCell((c) => { c.font = { bold: true }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BEIGE } }; });
}

export async function reportToXlsx(r: Report): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Plataforma de RH Riale";
  wb.created = r.generatedAt;
  const sub = `${filterSummary(r)} · gerado em ${fmtDateTime(r.generatedAt)}`;

  // Resumo
  const s = wb.addWorksheet("Resumo", { views: [{ showGridLines: false }] });
  s.columns = [{ width: 44 }, { width: 14 }, { width: 60 }];
  header(s, "Indicadores de RH — Recrutamento", sub);
  tableHead(s, ["Indicador", "Valor", "Observação"]);
  const c = r.counts;
  const rows: Array<[string, number, string]> = [
    ["Vagas abertas (agora)", c.vagasAbertasAgora, "Situação atual, independe do período"],
    ["Vagas abertas no período", c.vagasAbertasNoPeriodo, "Pela data de abertura"],
    ["Vagas encerradas no período", c.vagasEncerradas, "Preenchidas, canceladas ou encerradas"],
    ["Candidatos cadastrados", c.candidatosCadastrados, "Histórico importado: data da 1ª entrevista"],
    ["Entrevistas agendadas", c.entrevistasAgendadas, "Exceto canceladas"],
    ["Entrevistas realizadas", c.entrevistasRealizadas, ""],
    ["Faltas", c.faltas, ""],
    ["Desistências", c.desistencias, ""],
    ["Entrevistas passadas sem resultado", c.semResultado, "Pendências de registro do RH"],
    ["Aprovações do RH", c.aprovacoesRH, "Por entrevista"],
    ["Reprovações do RH", c.reprovacoesRH, "Por entrevista"],
    ["Aprovações dos gestores", c.aprovacoesGestor, "Pela data da decisão"],
    ["Reprovações dos gestores", c.reprovacoesGestor, "Pela data da decisão"],
    ["Pedidos de nova entrevista (gestor)", c.novaEntrevistaGestor, "Não contam como decisão"],
    ["Aguardando gestor (agora)", c.pendentesGestorAgora, ""],
    ["Contratações (admissões)", c.contratacoes, "Pela data de admissão"],
  ];
  for (const x of rows) s.addRow(x);

  // Conversão — taxa por fórmula
  const cv = wb.addWorksheet("Conversão", { views: [{ showGridLines: false }] });
  cv.columns = [{ width: 30 }, { width: 12 }, { width: 14 }, { width: 12 }, { width: 70 }, { width: 50 }];
  header(cv, "Taxas de conversão", sub);
  tableHead(cv, ["Taxa", "Numerador", "Denominador (n)", "Taxa", "Regra", "Fora do cálculo"]);
  const conv: Array<[string, Rate]> = [
    ["Comparecimento", r.conversion.comparecimento], ["Aprovação do RH", r.conversion.aprovacaoRH], ["Aprovação dos gestores", r.conversion.aprovacaoGestor],
    ["Conversão em contratação", r.conversion.contratacao], ["Desistência", r.conversion.desistencia],
  ];
  for (const [name, rt] of conv) {
    const row = cv.addRow([name, rt.num, rt.den, null, rt.rule, Object.entries(rt.excluded ?? {}).map(([k, v]) => `${v} ${k}`).join("; ")]);
    row.getCell(4).value = { formula: `IF(C${row.number}=0,"—",B${row.number}/C${row.number})` };
    row.getCell(4).numFmt = "0.0%";
  }

  // Produtividade — totais por fórmula
  const pr = wb.addWorksheet("Produtividade", { views: [{ showGridLines: false }] });
  pr.columns = [{ width: 36 }, { width: 12 }, { width: 12 }, { width: 10 }, { width: 14 }];
  header(pr, "Produtividade", sub);
  const groups: Array<[string, Report["byRecruiter"]]> = [["Por recrutadora", r.byRecruiter], ["Por unidade", r.byUnit], ["Por departamento", r.byDepartment], ["Por cargo", r.byPosition]];
  for (const [title, list] of groups) {
    pr.addRow([title]).font = { bold: true, color: { argb: BROWN } };
    tableHead(pr, ["", "Agendadas", "Realizadas", "Faltas", "Aprovadas RH"]);
    const first = pr.rowCount + 1;
    for (const g of list) pr.addRow([g.label, g.agendadas, g.realizadas, g.faltas, g.aprovadasRH]);
    const last = pr.rowCount;
    const t = pr.addRow(["Total", ...["B", "C", "D", "E"].map((col) => ({ formula: list.length ? `SUM(${col}${first}:${col}${last})` : "0" }))]);
    totalStyle(t);
    pr.addRow([]);
  }
  pr.addRow(["Contratações por recrutadora"]).font = { bold: true, color: { argb: BROWN } };
  tableHead(pr, ["Recrutadora", "Contratações"]);
  const hf = pr.rowCount + 1;
  for (const h of r.hiresByRecruiter) pr.addRow([h.label, h.value]);
  totalStyle(pr.addRow(["Total", { formula: r.hiresByRecruiter.length ? `SUM(B${hf}:B${pr.rowCount})` : "0" }]));
  pr.addRow([]);
  pr.addRow(["Tempo de avaliação dos gestores (dias corridos)"]).font = { bold: true, color: { argb: BROWN } };
  tableHead(pr, ["Gestor", "Decisões", "Média (d)", "Mediana (d)", "Pendentes agora"]);
  for (const m of r.managerTime) pr.addRow([m.label, m.n, d1(m.mean), d1(m.median), m.pending]);

  // SLA
  const sl = wb.addWorksheet("SLA", { views: [{ showGridLines: false }] });
  sl.columns = [{ width: 40 }, { width: 16 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 13 }, { width: 13 }, { width: 14 }, { width: 14 }];
  header(sl, "SLA por etapa (dias corridos)", sub + " · histórico importado não entra");
  tableHead(sl, ["Etapa", "Responsável", "Medições", "Média", "Mediana", "Máximo", "Na meta (qtd)", "Com meta (qtd)", "% na meta", "Em aberto agora"]);
  for (const x of r.sla) {
    const row = sl.addRow([x.label, x.owner, x.n, d1(x.mean), d1(x.median), d1(x.max), x.withinTarget.num, x.withinTarget.den, null, x.openNow.length]);
    row.getCell(9).value = { formula: `IF(H${row.number}=0,"sem meta",G${row.number}/H${row.number})` };
    row.getCell(9).numFmt = "0.0%";
  }
  sl.addRow([]);
  sl.addRow(["Cada etapa é atribuída a um único responsável; o tempo do gestor não é somado ao do RH. A etapa ponta a ponta é indicador de resultado."]).font = { italic: true, size: 9 };

  // Base
  const b = wb.addWorksheet("Base_Entrevistas");
  b.columns = ["Data", "Hora", "Candidato", "Cargo", "Unidade", "Departamento", "Gestor", "Recrutadora", "Etapa", "Situação", "Resultado RH", "Motivo", "Histórico importado"].map((h) => ({ header: h, width: 16 }));
  b.getRow(1).eachCell((cell) => { cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BROWN } }; });
  for (const i of [...r.base.interviews].sort((x, y) => x.scheduledAt.getTime() - y.scheduledAt.getTime())) {
    b.addRow([dateKey(i.scheduledAt), timeKey(i.scheduledAt), i.candidateName, i.positionTitle, i.unitName, i.departmentName, i.managerName ?? "", i.recruiter, i.stage, i.status, i.result, i.reason ?? "", i.historical ? "sim" : "não"]);
  }
  b.autoFilter = { from: "A1", to: "M1" };

  // Validação — conferências cruzadas por fórmula
  const v = wb.addWorksheet("Validação", { views: [{ showGridLines: false }] });
  v.columns = [{ width: 60 }, { width: 14 }, { width: 14 }, { width: 12 }];
  header(v, "Validação", "Conferências automáticas entre abas (0 = sem diferença)");
  tableHead(v, ["Conferência", "Valor A", "Valor B", "Diferença"]);
  const baseRows = b.rowCount; // inclui cabeçalho
  const checks: Array<[string, string, string]> = [
    ["Entrevistas agendadas (Resumo) × linhas não canceladas da base", "Resumo!B9", `COUNTIF(Base_Entrevistas!J2:J${Math.max(2, baseRows)},"<>CANCELADA")`],
    ["Faltas (Resumo) × resultado NAO_COMPARECEU na base", "Resumo!B11", `COUNTIF(Base_Entrevistas!K2:K${Math.max(2, baseRows)},"NAO_COMPARECEU")`],
    ["Aprovações do RH (Resumo) × resultado APROVADO na base", "Resumo!B14", `COUNTIF(Base_Entrevistas!K2:K${Math.max(2, baseRows)},"APROVADO")`],
  ];
  for (const [label, a, bb] of checks) {
    const row = v.addRow([label, { formula: a }, { formula: bb }, null]);
    row.getCell(4).value = { formula: `B${row.number}-C${row.number}` };
  }

  // Metodologia
  const m = wb.addWorksheet("Metodologia", { views: [{ showGridLines: false }] });
  m.columns = [{ width: 34 }, { width: 110 }];
  header(m, "Metodologia e premissas", sub);
  tableHead(m, ["Tema", "Regra"]);
  const rules: Array<[string, string]> = [
    ["Fonte", "Banco de dados da plataforma (sem dados fictícios). Escopo do usuário que exportou."],
    ["Período", "Contagens pela data do evento: entrevista (data agendada), decisão do gestor (data da decisão), admissão (data de início), vaga (abertura/encerramento)."],
    ["Coorte das taxas", "Aprovação do RH, contratação e desistência: candidaturas cuja 1ª entrevista caiu no período (cada candidatura conta uma vez)."],
    ...conv.map(([n, rt]) => [n, rt.rule] as [string, string]),
    ["SLA", "Dias corridos entre os marcos da etapa; cada etapa tem um responsável e não é somada às demais. Histórico importado fora (sem horário e sem abertura real da vaga)."],
    ["Meta de SLA", "Mais específica vale: cargo + departamento › cargo › departamento › padrão da etapa. Sem meta = sem cálculo de % na meta (não é zero)."],
    ["Recrutadora", "Usuário vinculado à entrevista; no histórico importado, o primeiro nome registrado na planilha (\"Sara / Aline\" → \"Sara\")."],
    ["Contratação", "Admissão registrada pelo RH no candidato com aprovação final (RH + gestor + avaliação externa, quando houver)."],
    ["Limitações", "Taxas de coortes recentes ainda sobem enquanto houver candidaturas em processo. Valores \"—\" indicam ausência de observações, nunca zero."],
  ];
  for (const x of rules) m.addRow(x).alignment = { wrapText: true, vertical: "top" };

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ═════════════════════════ PDF ═════════════════════════

export async function reportToPdf(r: Report): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 40, info: { Title: "Indicadores de RH — Riale Hotéis", Author: "Plataforma de RH Riale" } });
  const chunks: Buffer[] = [];
  doc.on("data", (b: Buffer) => chunks.push(b));
  const done = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));
  const W = doc.page.width - 80;
  const brown = "#5C3D1E", gold = "#8B6340", beige = "#F5EFE6", ink = "#2b2118";

  const banner = () => {
    doc.rect(0, 0, doc.page.width, 54).fill(brown);
    doc.fillColor(beige).font("Helvetica-Bold").fontSize(13).text("RIALE HOTÉIS · INDICADORES DE RH", 40, 20);
    doc.fillColor(ink).font("Helvetica");
    doc.y = 70;
  };
  const footer = () => {
    doc.fontSize(7).fillColor(gold).text(`Uso interno e confidencial · gerado em ${fmtDateTime(r.generatedAt)} · ${filterSummary(r)}`, 40, doc.page.height - 30, { width: W, align: "center" });
  };
  const ensure = (h: number) => { if (doc.y + h > doc.page.height - 50) { footer(); doc.addPage(); banner(); } };
  const section = (t: string) => { ensure(40); doc.moveDown(0.6); doc.font("Helvetica-Bold").fontSize(11).fillColor(brown).text(t); doc.moveTo(40, doc.y + 2).lineTo(40 + W, doc.y + 2).strokeColor(gold).lineWidth(0.6).stroke(); doc.moveDown(0.5); doc.font("Helvetica").fillColor(ink).fontSize(9); };
  const table = (cols: Array<{ h: string; w: number; align?: "left" | "right" }>, rows: Array<Array<string | number>>) => {
    const rowH = 15;
    ensure(rowH * 2);
    let x = 40;
    const y0 = doc.y;
    doc.rect(40, y0, W, rowH).fill(beige);
    doc.fillColor(brown).font("Helvetica-Bold").fontSize(8);
    for (const c of cols) { doc.text(c.h, x + 3, y0 + 4, { width: c.w - 6, align: c.align ?? "left" }); x += c.w; }
    doc.font("Helvetica").fillColor(ink);
    let y = y0 + rowH;
    for (const row of rows) {
      if (y + rowH > doc.page.height - 50) { footer(); doc.addPage(); banner(); y = doc.y; }
      x = 40;
      row.forEach((v, i) => { doc.fontSize(8).text(String(v), x + 3, y + 4, { width: cols[i].w - 6, align: cols[i].align ?? "left", lineBreak: false, ellipsis: true }); x += cols[i].w; });
      doc.moveTo(40, y + rowH).lineTo(40 + W, y + rowH).strokeColor("#e7e5e4").lineWidth(0.4).stroke();
      y += rowH;
    }
    doc.y = y + 6;
    doc.x = 40;
  };

  banner();
  doc.fontSize(10).fillColor(gold).text(filterSummary(r));
  doc.fillColor(ink);
  const c = r.counts;
  section("1. Recrutamento");
  table([{ h: "Indicador", w: W * 0.7 }, { h: "Valor", w: W * 0.3, align: "right" }], [
    ["Vagas abertas (agora)", c.vagasAbertasAgora], ["Vagas encerradas no período", c.vagasEncerradas], ["Candidatos cadastrados", c.candidatosCadastrados],
    ["Entrevistas agendadas / realizadas", `${c.entrevistasAgendadas} / ${c.entrevistasRealizadas}`], ["Faltas · desistências", `${c.faltas} · ${c.desistencias}`],
    ["Aprovações · reprovações do RH", `${c.aprovacoesRH} · ${c.reprovacoesRH}`], ["Aprovações · reprovações dos gestores", `${c.aprovacoesGestor} · ${c.reprovacoesGestor}`],
    ["Aguardando gestor (agora)", c.pendentesGestorAgora], ["Contratações", c.contratacoes],
  ]);
  section("2. Conversão");
  const conv: Array<[string, Rate]> = [["Comparecimento", r.conversion.comparecimento], ["Aprovação do RH", r.conversion.aprovacaoRH], ["Aprovação dos gestores", r.conversion.aprovacaoGestor], ["Conversão em contratação", r.conversion.contratacao], ["Desistência", r.conversion.desistencia]];
  table([{ h: "Taxa", w: W * 0.34 }, { h: "Valor", w: W * 0.13, align: "right" }, { h: "Observações", w: W * 0.2, align: "right" }, { h: "Fora do cálculo", w: W * 0.33 }], conv.map(([n, rt]) => [n, pctTxt(rt), `${rt.num} de ${rt.den}`, Object.entries(rt.excluded ?? {}).filter(([, v]) => v).map(([k, v]) => `${v} ${k}`).join("; ") || "—"]));
  section("3. Produtividade — entrevistas por recrutadora");
  table([{ h: "Recrutadora", w: W * 0.4 }, { h: "Agendadas", w: W * 0.15, align: "right" }, { h: "Realizadas", w: W * 0.15, align: "right" }, { h: "Faltas", w: W * 0.15, align: "right" }, { h: "Aprov. RH", w: W * 0.15, align: "right" }], r.byRecruiter.map((g) => [g.label, g.agendadas, g.realizadas, g.faltas, g.aprovadasRH]));
  section("Entrevistas por unidade");
  table([{ h: "Unidade", w: W * 0.4 }, { h: "Agendadas", w: W * 0.15, align: "right" }, { h: "Realizadas", w: W * 0.15, align: "right" }, { h: "Faltas", w: W * 0.15, align: "right" }, { h: "Aprov. RH", w: W * 0.15, align: "right" }], r.byUnit.map((g) => [g.label, g.agendadas, g.realizadas, g.faltas, g.aprovadasRH]));
  section("Tempo de avaliação dos gestores");
  table([{ h: "Gestor", w: W * 0.4 }, { h: "Decisões", w: W * 0.15, align: "right" }, { h: "Média", w: W * 0.15, align: "right" }, { h: "Mediana", w: W * 0.15, align: "right" }, { h: "Pendentes", w: W * 0.15, align: "right" }], r.managerTime.map((m) => [m.label, m.n, m.mean === null ? "—" : `${d1(m.mean)} d`, m.median === null ? "—" : `${d1(m.median)} d`, m.pending]));
  section("4. SLA por etapa (dias corridos; cada etapa com um responsável)");
  table([{ h: "Etapa", w: W * 0.36 }, { h: "Resp.", w: W * 0.13 }, { h: "n", w: W * 0.07, align: "right" }, { h: "Média", w: W * 0.11, align: "right" }, { h: "Mediana", w: W * 0.11, align: "right" }, { h: "Na meta", w: W * 0.11, align: "right" }, { h: "Abertos", w: W * 0.11, align: "right" }],
    r.sla.map((x) => [x.label, x.owner, x.n, x.mean === null ? "—" : `${d1(x.mean)} d`, x.median === null ? "—" : `${d1(x.median)} d`, x.withinTarget.den ? pctTxt(x.withinTarget) : "sem meta", x.openNow.length]));
  ensure(40);
  doc.fontSize(7.5).fillColor(gold).text("Regras: taxas com numerador e denominador explícitos; coorte pela 1ª entrevista no período; histórico importado entra nas contagens e taxas, não nos SLAs. Detalhes na aba Metodologia do Excel.", { width: W });
  footer();
  doc.end();
  return done;
}
